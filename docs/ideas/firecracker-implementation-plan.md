# Firecracker Implementation Plan

> This document breaks down the implementation work for adding Firecracker VM sandboxing support. See the [Firecracker VM Sandboxing Decision](../decisions/firecracker-vm-sandboxing.md) for architectural context.

## Implementation Phases

### Phase 1: Foundation

#### 1.1 Extend Data Models

**File**: `packages/api/project.schema.ts`
```typescript
export const projectSchema = z.object({
  // ... existing fields ...
  sandboxType: z.enum(["docker", "firecracker"]).default("docker"),
  
  vmConfig: z.object({
    vCpus: z.number().min(1).max(8).default(2),
    memoryMb: z.number().min(512).max(8192).default(2048),
  }).optional(),
});
```

**Tasks:**
- [ ] Add `sandboxType` field to projects table (migration)
- [ ] Add `vmConfig` JSON field to projects table
- [ ] Update Drizzle schema and generate migration
- [ ] Update API handlers to accept new fields

#### 1.2 Extend SandboxService Interface

**File**: `apps/server/src/sandbox/SandboxService.ts`
```typescript
// Export new types for VM sandboxing
type VmState = 
  | { status: "running" }
  | { status: "slept"; snapshot: SnapshotMetadata }
  | { status: "stopped" }
  | { status: "error"; error: string };

type Snapshot = {
  id: SnapshotId;
  vmId: SandboxId;
  path: AbsoluteFilePath; // S3 key or local path
  createdAt: Date;
  sizeBytes: number;
};

export interface VMSandboxService extends SandboxService {
  sleepSandbox(id: SandboxId): Promise<Result<Snapshot, SleepFailure>>;
  wakeSandbox(id: SandboxId): Promise<Result<"resumed", WakeFailure>>;
  enableSSH(id: SandboxId): Promise<Result<{ sshPort: number }, SSHFailure>>;
  getSandboxState(id: SandboxId): Promise<VmState>;
}
```

**Tasks:**
- [ ] Define error types (`SleepFailure`, `WakeFailure`, `SSHFailure`)
- [ ] Create branded type for `SnapshotId`
- [ ] Make interface extend base `SandboxService`

---

### Phase 2: VM Lifecycle Implementation

#### 2.1 Firecracker VM Manager

**File**: `apps/server/src/sandbox/FirecrackerVMManager.ts`

This is the low-level client that talks to Firecracker's microVM API.

**Key responsibilities:**
- [ ] Spawn/firecracker binary with correct arguments
- [ ] Use Firecracker's REST API (HTTP on UNIX socket) for VM control
- [ ] Implement: `createVM`, `startVM`, `stopVM`, `pauseVM`
- [ ] Handle VM lifecycle state machine

**Technical notes:**
```typescript
// Firecracker expects:
// firecracker --socket-path /tmp/firecracker-<vmid>.sock --uid 0 --gid 0

// Key Firecracker API calls:
// POST /vm - Create VM instance
// PUT  /vm/start - Start the VM
// PUT  /vm暂停 - Pause the VM
// DELETE /vm - Stop and destroy the VM
```

#### 2.2 FirecrackerSandboxService

**File**: `apps/server/src/sandbox/FirecrackerSandboxService.ts`

**Key responsibilities:**
- [ ] Implement base `SandboxService` interface (drop-in replacement)
- [ ] Integrate with `FileSystemService` for temp directories
- [ ] Configure VM networking (veth pairs, NAT)
- [ ] Mount volumes via 9p filesystem
- [ ] Handle lifecycle.sh execution via VM's init

**Pseudo-code:**
```typescript
class FirecrackerSandboxService implements SandboxService {
  constructor(
    private vmManager: FirecrackerVMManager,
    private fileSystemService: FileSystemService,
    private networkConfig: NetworkConfiguration
  ) {}
  
  async createNewSandbox(options: SandboxInitOptions): Promise<Sandbox> {
    // 1. Create temp dir for VM files
    const vmDir = await this.fileSystemService.createTempDirectory("vm-");
    
    // 2. Configure VM
    const vm = await this.vmManager.createVM({
      vCpus: options.vCpus ?? 2,
      memoryMb: options.memoryMb ?? 2048,
      rootfs: this.rootfsPath,
      network: "10.0.1.x",
    });
    
    // 3. Configure volume mounts (9p filesystem)
    await this.configureVolumeMounts(vm, options.volumes);
    
    return { id: vm.id, type: "firecracker" };
  }
}
```

---

### Phase 3: Networking

#### 3.1 Host Network Configuration

**File**: `apps/server/src/sandbox/VMNetworkManager.ts`

**Key responsibilities:**
- [ ] Create veth pairs for each VM (host <-> VM)
- [ ] Configure NAT for internet access
- [ ] Set up DNS with `host-gateway` entry
- [ ] Handle IP address allocation (10.0.1.x range)

**Technical approach:**
```bash
# Per VM, create network namespace:
mknod -t ${vmDir}/net ns
ip netns add ${vmId}

# Create veth pair:
ip link add ${vmId}-vnet0 type vnet peer name ${vmId}-tap0

# One end in VM namespace, one on host bridge:
ip link set ${vmId}-vnet0 netns ${vmId}
ip link set ${vmId}-tap0 br-lan

# Configure NAT:
iptables -t nat -A POSTROUTING -s 10.0.1.0/24 -j MASQUERADE
```

#### 3.2 Host Service Access

**Tasks:**
- [ ] Configure host-gateway DNS resolution (custom resolver or /etc/hosts)
- [ ] Set up iptables DNAT for host service ports (MCP, Ollama)
- [ ] Ensure Docker socket can be mounted via 9p (bypasses network, direct filesystem)

---

### Phase 4: Snapshot/Restore (Sleep/Wake)

#### 4.1 VMSnapshotService

**File**: `apps/server/src/sandbox/VMSnapshotService.ts`

**Key responsibilities:**
- [ ] Call Firecracker's `create-snapshot` API
- [ ] Upload snapshot to S3 (multipart upload for large files)
- [ ] Download snapshot from S3 on restore
- [ ] Call Firecracker's `restore-from-snapshot` API
- [ ] Track snapshot metadata in database

**Tasks:**
- [ ] Add `vm_snapshots` table to database (migration)
- [ ] Create `VMSnapshotService` with S3 client
- [ ] Implement upload/download with retry logic
- [ ] Handle snapshot cleanup (on task completion)

**S3 considerations:**
```typescript
// Snapshot is ~500MB for 2GB RAM VM (compressed)
// Use multipart upload:
await s3.upload({
  Bucket: "agent-snapshots",
  Key: `vm-${vmId}/${timestamp}.snapshot`,
  Body: readStream(snapshotPath),
  ContentType: "application/octet-stream",
});
```

#### 4.2 Integrate with WorkflowExecutionService

**Tasks:**
- [ ] Detect when agent is "stuck" waiting for human input
- [ ] Auto-sleep after configurable timeout (optional)
- [ ] On wake, feed additional input to agent (if provided)
- [ ] Track sleep/wake state in `runs` table

---

### Phase 5: SSH/VS Code Integration

#### 5.1 SSHService

**File**: `apps/server/src/sandbox/SSHSERVICE.ts`

**Key responsibilities:**
- [ ] Allocate unique host port per VM (39000-39999 range)
- [ ] Configure port forwarding via iptables
- [ ] Generate SSH host keys per VM
- [ ] Provide connection info for VS Code

**Technical approach:**
```typescript
class SSHService {
  async enableSSH(vmId: SandboxId): Promise<{ sshPort: number }> {
    // 1. Allocate port
    const sshPort = await this.allocateSSHPort(vmId);
    
    // 2. Configure iptables NAT:
    // iptables -t nat -A PREROUTING -p tcp --dport ${sshPort} \
    //   -j DNAT --to-destination 10.0.1.x:22
    
    // 3. Return connection info:
    return { sshPort };
  }
}
```

**Tasks:**
- [ ] Implement port allocation with tracking (avoid conflicts)
- [ ] Configure iptables port forwarding
- [ ] Ensure SSH server is running in VM (OpenSSH configured)
- [ ] Generate unique host keys per VM

#### 5.2 VS Code Integration

**Tasks:**
- [ ] Create `ssh-config` output for easy VS Code connection
- [ ] Document how to use "Remote - SSH" with generated config
- [ ] Consider auto-enabling SSH for Firecracker VMs

---

### Phase 6: VM Image Build

#### 6.1 Base Image Creation

**File**: `scripts/build-vm-image.sh`

```bash
#!/bin/bash
# Build minimal Ubuntu rootfs for Firecracker VMs

set -e

STAGE=$1
ROOTFS_DIR="build/rootfs"
OUTPUT="vm-image.rootfs"

case $STAGE in
  download)
    # Download minimal rootfs or use debootstrap
    sudo debootstrap --foreign jammy $ROOTFS_DIR http://archive.ubuntu.com/ubuntu/
    ;;
    
  configure)
    sudo chroot $ROOTFS_DIR /bin/bash -c "
      apt-get update && apt-get install -y \
        openssh-server \
        git \
        docker.io \
        curl \
        wget \
        build-essential \
        && rm -rf /var/lib/apt/lists/*";
      
      # Configure SSH
      mkdir -p /var/run/sshd
      ssh-keygen -A 
      
      # Create agent user (optional, for SSH)
      useradd -m -s /bin/bash agent
    "
    ;;
    
  package)
    # Create squashfs image
    mksquashfs $ROOTFS_DIR $OUTPUT -quiet
    echo "Built: $OUTPUT ($(du -h $OUTPUT | cut -f1))"
    ;;
esac
```

**Tasks:**
- [ ] Write build script with proper stages
- [ ] Test image boot in Firecracker sandbox
- [ ] Verify Docker, Git, SSH work inside VM
- [ ] Document image size and contents

---

### Phase 7: API Integration

#### 7.1 New Endpoints

**File**: `apps/server/src/tasks/...` (handler files)

```typescript
// Sleep a running agent's VM
POST /projects/:projectId/tasks/:taskId/sleep
→ { success: true, snapshot: {...} }

// Wake a slept agent's VM (optionally with new input)
POST /projects/:projectId/tasks/:taskId/wake
body: { additionalInput?: string }
→ { success: true, state: "resumed" }

// Get current sandbox/VM state
GET /projects/:projectId/tasks/:taskId/sandbox-state
→ { status: "running" | "slept" | "stopped", ... }

// Get SSH connection info (for VS Code)
GET /projects/:projectId/tasks/:taskId/ssh-connect
→ { sshPort: number, sshCommand: "ssh -p <port> agent@localhost" }
```

**Tasks:**
- [ ] Add new API routes to Cerato schema
- [ ] Implement handlers that delegate to services
- [ ] Add proper error handling and validation
- [ ] Write API tests (unit level)

---

### Phase 8: Platform Detection & Fallback

#### 8.1 Factory Pattern

**File**: `apps/server/src/services.ts`

```typescript
function createSandboxService(config: Configuration): SandboxService {
  const platform = detectPlatform();
  
  if (platform === "linux" && config.sandboxType === "firecracker") {
    return new FirecrackerSandboxService(...);
  }
  
  // Default to Docker on macOS or if sandboxType === "docker"
  return new DockerSandboxService(...);
}

function detectPlatform(): "linux" | "macos" {
  return process.platform === "darwin" ? "macos" : "linux";
}
```

**Tasks:**
- [ ] Implement platform detection
- [ ] Add configuration option to override auto-detection
- [ ] Ensure graceful fallback on unsupported platforms
- [ ] Log warnings when falling back to Docker

---

### Phase 9: Testing & Validation

#### 9.1 Unit Tests
- [ ] Test `FirecrackerSandboxService` interface compliance
- [ ] Test `VMSnapshotService` with mocked S3 client
- [ ] Test port allocation logic in `SSHSERVICE`
- [ ] Test network configuration generation

#### 9.2 Integration Tests (Linux only)
- [ ] Spin up real Firecracker VM
- [ ] Test full lifecycle: create → start → sleep → wake → stop
- [ ] Verify networking (internet access, host-gateway DNS)
- [ ] Test SSH connection from host
- [ ] Verify Docker-in-VM works (build image, run container)

#### 9.3 End-to-End Tests
- [ ] Create task with `sandboxType: "firecracker"`
- [ ] Verify agent runs, does work
- [ ] Sleep agent mid-execution
- [ ] Wake agent with additional input
- [ ] Verify work continues from checkpoint

---

## Dependencies & Setup

### System Requirements (Linux)

```bash
# Install Firecracker binary
curl -L https://github.com/firecracker-microvm/firecracker/releases/download/v1.9.0/firecracker-v1.9.0-x86_64.tar.gz | tar -xz
sudo mv firecracker /usr/local/bin/
sudo chmod 4755 /usr/local/bin/firecracker

# Verify KVM access
ls -l /dev/kvm  # Should exist and be accessible to user
sudo usermod -aG kvm $USER  # Add current user to kvm group
```

### S3 Configuration (for snapshots)

```typescript
// Environment variables needed:
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
SNAPSHOT_S3_BUCKET=agent-snapshots
SNAPSHOT_S3_ENDPOINT=http://localhost:9000  // For MinIO, etc.
```

---

## Open Questions / Technical Debates

### 1. Network Configuration Approach

**Option A: Use Firecracker's built-in networking (Jailed Tap Device)**
- Pros: Managed by Firecracker, good security, "just works"
- Cons: Less flexible, harder to debug

**Option B: Manual veth + iptables (traditional Linux networking)**
- Pros: Full control, familiar tools, easy to debug with `ip netns`
- Cons: More code, need root privileges for iptables

**Recommendation**: Start with Option B (manual) for flexibility and debugging, consider migrating to Option A later.

### 2. Volume Mounting: 9p vs OverlayFS

**Option A: virtio-9p (Firecracker-native file sharing)**
- Pros: Built-in, good for read-only mounts (lifecycle.sh)
- Cons: Performance overhead, complex setup

**Option B: OverlayFS inside VM (for read-write code)**
- Pros: Good performance, standard Linux approach
- Cons: Need to copy files into VM first

**Recommendation**: Hybrid - use 9p for read-only (lifecycle.sh, task.txt), overlayFS or direct mount for /code

### 3. Snapshot Size vs RAM

Current estimation: ~25-50% of allocated RAM per snapshot (compressed)

| VM Config | Snapshot Size | S3 Upload Time @ 10Mbps |
|-----------|---------------|------------------------|
| 2GB RAM   | ~500MB-1GB    | 67-134 seconds         |
| 1GB RAM   | ~250MB-500MB  | 34-67 seconds          |
| 512MB RAM | ~130MB-250MB  | 17-34 seconds          |

**Tradeoff**: Lower RAM = faster snapshots, but may OOM on complex tasks.

**Recommendation**: Default to 2GB RAM, allow per-project override down to 512MB

### 4. SSH Host Key Management

**Option A: Generate new key per VM (ephemeral)**
- Pros: Maximum isolation, no persistent state
- Cons: User must accept new key every time (annoying)

**Option B: Persistent key per project/task**
- Pros: User accepts once, then auto-connects
- Cons: Need to store keys, potential security concern if leaked

**Option C: Project-level key (shared across VMs)**
- Pros: Single key per project, easy to manage
- Cons: Reduces VM isolation slightly

**Recommendation**: Option B (persistent per task/run). Store in database, allow user to set custom key via config.

---

## Verification Checklist

Before merging:
- [ ] All new services implement proper interfaces
- [ ] Type-checking passes (`pnpm typecheck`)
- [ ] Linting passes (`pnpm check`)
- [ ] Unit tests pass
- [ ] Integration tests run on Linux with KVM
- [ ] Documentation updated (this doc + decision doc + API docs)
- [ ] `pnpm build` succeeds
- [ ] Manual testing: sleep/wake cycle works end-to-end