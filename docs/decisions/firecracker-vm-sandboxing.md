# Firecracker VM Sandboxing

## Context

The application currently uses Docker containers to sandbox agent execution. While this works well for many scenarios, there are important use cases that Docker cannot satisfy effectively:

1. **Docker access for agents**: Agents need to run Docker (e.g., spin up Postgres for testing) without polluting host state or conflicting with other agents
2. **Port exposure**: Agents building web services need to expose ports for human verification during development
3. **Sleep/wake capability**: Ability to freeze an agent's workspace mid-execution and resume later (e.g., after human review of a PR)
4. **Improved isolation**: VM-level isolation is stronger than container-level, important for untrusted agent code
5. **VS Code/Cursor integration**: Direct IDE access into running agent sessions for debugging and manual intervention

## Decision

### High-Level Architecture

- **VM Runtime**: Firecracker microVMs, chosen for fast startup, minimal resource usage, and native snapshot/restore support
- **Platform Strategy**: Platform-specific sandboxing:
  - Linux: Firecracker (native KVM)
  - macOS: Docker (testing/development, with Firecracker as aspirational goal)
- **Sandbox Selection**: Per-project configuration (`sandboxType: "docker" | "firecracker"`), defaulting to Docker for backward compatibility
- **VM Lifecycle**: 1:1 mapping of tasks to VMs (matching current Docker semantics)
- **Resource Limits**: Firecracker-native CPU and memory limits per VM:
  - Default: 2 vCPUs, 2048 MB RAM
  - Configurable per project via `vmConfig`

### VM Image Strategy

- **Base OS**: Minimal Ubuntu 24.04 (Jammy) rootfs (~100-200MB)
- **Included Tools**: Git, Docker daemon, OpenSSH server, curl, wget, build-essential
- **Image Format**: Firecracker-compatible rootfs (squashfs or tarball)
- **Build Process**: Custom build script using `debootstrap` + customization

### Docker-in-VM Design

- **Full Docker daemon per VM**: Each VM runs its own Docker daemon with its own image/container storage
- **Rationale**: Full isolation is preferred over complexity of rootless Docker or shared host socket
- **Tradeoff**: ~50MB RAM overhead per VM for Docker daemon (acceptable at 1-5 concurrent agents)

### Networking Architecture

```
┌─────────────────────────────────────────┐
│           Host Network                  │
│                                        │
│  ┌───────────────────────────────┐     │
│  │      NAT Gateway (iptables)   │     │
│  │                               │     │
│  │  VM #1 (10.0.1.2)            │     │
│  │    └─→ Internet access       │     │
│  │                               │     │
│  │  VM #2 (10.0.1.3)            │     │
│  │    └─→ Internet access       │     │
│  └───────────┬───────────────────┘     │
│              ↓ Host Services via DNS   │
│  host-gateway:3050 → MCP Server       │
│  host-gateway:11434 → Ollama         │
└───────────────────────────────────────┘
```

- **VM Network Range**: `10.0.1.0/24` (one VM per IP)
- **Internet Access**: NAT via iptables
- **Host Service Access**: Custom DNS entry `host-gateway` → host IP with port forwarding
- **SSH Port Forwarding**: Dynamic allocation (ports 39000+)

### Sleep/Wake (Checkpoint/Restore)

- **Mechanism**: Firecracker's native VM snapshotting (memory + CPU state)
- **Storage**: S3-compatible object storage per snapshot
- **Snapshot Metadata**: PostgreSQL table linking snapshots to runs/tasks
- **User Flow**:
  - Sleep: POST `/projects/:id/tasks/:id/sleep` → snapshot created, VM paused
  - Wake: POST `/projects/:id/tasks/:id/wake` → VM restored, execution resumes
- **Optional**: Additional input can be fed on wake (e.g., human feedback)

### VS Code/Cursor Remote Development

- **SSH Server**: OpenSSH running in each VM, enabled by default for Firecracker sandboxes
- **Connection Model**: Direct SSH via dynamic port forwarding
  - Each VM gets unique host port (39000+)
  - User connects via: `ssh -p <port> agent@localhost`
- **VS Code Integration**: Uses native "Remote - SSH" functionality
- **Key Management**: Auto-generated per-VM host keys, user accepts on first connect

### Interface Design

Extended `SandboxService` interface with VM-specific capabilities:

```typescript
interface VMSandboxService extends SandboxService {
  // Sleep/wake capabilities (checkpoint & restore)
  sleepSandbox(id: SandboxId): Promise<Result<Snapshot, SleepFailure>>;
  wakeSandbox(id: SandboxId): Promise<Result<"resumed", WakeFailure>>;
  
  // VS Code/Cursor integration
  enableSSH(id: SandboxId): Promise<Result<{ sshPort: number }, SSHFailure>>;
  
  // Query VM state
  getSandboxState(id: SandboxId): Promise<VmState>;
}

type VmState = 
  | { status: "running" }
  | { status: "slept"; snapshot: SnapshotMetadata }
  | { status: "stopped" }
  | { status: "error"; error: string };
```

### Data Models

**Extended Project Schema:**
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

**New Tables:**
- `vm_snapshots`: Stores snapshot metadata (S3 path, size, timestamp)
- Linked to `runs` table (1:1 relationship for slept VMs)

### Implementation Structure

```
apps/server/src/sandbox/
├── SandboxService.ts           # Base interface (extended)
├── DockerSandboxService.ts     # Existing implementation
├── FirecrackerSandboxService.ts  # New: High-level service
├── FirecrackerVMManager.ts     # Low-level Firecracker client
├── VMSnapshotService.ts        # S3 snapshot storage/restore
└── SSHService.ts               # SSH port forwarding management
```

## Consequences

### Positive

- **Strong isolation**: VM-level boundaries prevent container escape issues
- **Docker access**: Agents can build images, run containers without conflicts
- **Sleep/wake**: Human-in-the-loop workflows become practical (PR review → sleep → wake with feedback)
- **Debugging**: Direct IDE access into agent sessions
- **Fast startup**: Firecracker VMs start in ~100ms (vs Docker's container overhead)
- **Snapshot restore**: Near-instant wake from snapshot (~500ms for state restore)

### Negative

- **Complexity**: Additional infrastructure code (VM management, networking, snapshots)
- **macOS testing**: Firecracker requires Docker wrapper or platform detection
- **Memory overhead**: ~50MB per VM for Docker daemon (acceptable at small scale)
- **Snapshot storage**: S3 bandwidth and storage costs (~$1.50/snapshot at 500MB)
- **Snapshot time**: Sleep/wake operations take ~10-30 seconds (network-bound)

### New API Surface

```
POST /projects/:projectId/tasks/:taskId/sleep
→ { success: true, snapshot: {...} }

POST /projects/:projectId/tasks/:taskId/wake
body: { additionalInput?: string }
→ { success: true, state: "resumed" }

GET /projects/:projectId/tasks/:taskId/sandbox-state
→ { status: "running" | "slept" | ... }

GET /projects/:projectId/tasks/:taskId/ssh-connect
→ { sshPort: number, sshCommand: "ssh -p <port> agent@localhost" }
```

### Migration Path

- Existing Docker-based workflows continue unchanged
- New projects can opt into Firecracker via `sandboxType` field
- No automatic migration needed; gradual adoption per project
- Shared code (lifecycle.sh, task.txt mounting) can be reused

### Testing Considerations

- Unit tests: Service layer can be tested with mocks
- Integration tests: Require actual Firecracker binary and KVM access
- Platform-specific test suites needed (macOS vs Linux)
- Snapshot/restore requires end-to-end testing

### Operational Concerns

**Resource Monitoring:**
- Need to track VM count, memory usage across all agents
- 5 concurrent VMs @ 2GB each = 10GB RAM requirement (plus host overhead)

**Cleanup:**
- Sleeping VMs leave snapshots in S3 (need lifecycle/retention policy)
- Failed tasks should auto-delete VMs and snapshots
- Need periodic cleanup job for orphaned snapshots

**Security:**
- VMs have full Docker access (intentional, but means agents can build malicious containers)
- SSH host keys need secure generation and storage
- S3 bucket access needs proper IAM/policy configuration