---
name: VM Sandbox Support
overview: Add VM-based sandboxes alongside existing Docker sandboxes, using Cloud Hypervisor (Linux) and vfkit (macOS) with virtio-fs for host-guest file sharing. Sandbox type is configurable per workspace and project.
todos:
  - id: env-config
    content: "Add VM env vars to `apps/server/src/env.ts`. Read the existing file to see how env vars are defined (Zod validation pattern). Add these optional vars: VM_KERNEL_PATH, VM_ROOTFS_PATH, VIRTIOFSD_PATH, CLOUD_HYPERVISOR_PATH, VFKIT_PATH, VM_HOST_BRIDGE_IP (default 192.168.100.1). All should be optional strings. See plan section 9 for details."
    status: pending
  - id: sandbox-type-db
    content: Add sandbox type configuration to the DB layer. (1) Add `sandboxTypeEnum` and `sandboxTypeConfigurationTable` to `apps/server/src/db/schema.ts` -- see the exact schema in plan section 6. (2) Create `apps/server/src/sandbox/SandboxTypeConfigRepository.ts` with a `DatabaseSandboxTypeConfigRepository` class. Read `apps/server/src/harness/AgentHarnessConfigRepository.ts` as the pattern to follow -- it has the same hierarchical resolution logic (task -> project -> workspace -> default), but sandbox type only uses project -> workspace -> default 'docker'. Do NOT generate a DB migration; a human will do that.
    status: pending
  - id: vm-init-script
    content: Create `apps/server/src/sandbox/vm/vm-init.sh`. This is a minimal shell script that will be baked into the VM rootfs at /sbin/vm-init. It mounts /proc, /sys, /dev, then mounts virtio-fs at /mnt/host using tag 'hostshare', then execs /mnt/host/vm-mount-setup.sh. See the exact script in plan section 3.
    status: pending
  - id: vm-platform-adapter
    content: Create the VM platform abstraction layer under `apps/server/src/sandbox/vm/`. (1) Define `VmPlatformAdapter` interface in VmPlatformAdapter.ts -- see plan section 1 for the full interface. (2) Implement `CloudHypervisorAdapter` -- spawns virtiofsd and cloud-hypervisor as child processes, talks to Cloud Hypervisor REST API over Unix socket (PUT /api/v1/vm.boot, PUT /api/v1/vm.shutdown, GET /api/v1/vm.info). Use Node.js http.request with socketPath option for Unix socket HTTP. (3) Implement `VfkitAdapter` -- spawns vfkit with --device virtio-fs,sharedDir=...,mountTag=... and --restful-uri unix://..., talks to vfkit REST API. vfkit handles virtio-fs natively (no separate virtiofsd). Binary paths come from env vars added in the env-config todo. See plan section 1 for full details.
    status: pending
  - id: vm-sandbox-service
    content: "Implement `VmSandboxService` in `apps/server/src/sandbox/vm/VmSandboxService.ts` implementing the `SandboxService` interface from `apps/server/src/sandbox/SandboxService.ts`. Read `DockerSandboxService` in the same file as the pattern -- it implements the same interface. Key difference: instead of Docker containers, this service (a) starts virtiofsd + VMM via the adapter, (b) generates a vm-mount-setup.sh script that maps SandboxInitOptions.volumes to symlinks/copies inside the VM (see plan section 2 for the mapping logic and examples), (c) monitors the VMM child process for exit. The SandboxInitOptions type is already defined and stays unchanged. See plan section 2 for full lifecycle details."
    status: pending
  - id: vm-rootfs-build
    content: "Create `scripts/build-vm-rootfs.sh` and add `pnpm vm:build-rootfs` to root package.json. The script: (1) builds the Docker image from the existing Dockerfile, (2) docker export to get a rootfs tarball, (3) creates a raw ext4 disk image, (4) copies the exported filesystem into it, (5) adds the vm-init.sh script (from the vm-init-script todo) to /sbin/vm-init. Also downloads a pre-built kernel from https://github.com/cloud-hypervisor/linux/releases. See plan section 4 for full steps."
    status: pending
  - id: host-networking
    content: Create `scripts/setup-vm-networking.sh` for Linux host networking (bridge, NAT, IP forwarding). See plan section 5 for the exact commands. On macOS, vfkit handles networking via Virtualization.framework NAT -- no manual setup needed. This script is run once by the developer, not automated.
    status: pending
  - id: workflow-refactor
    content: "Refactor `apps/server/src/workflow/WorkflowExecutionService.ts` to support both sandbox types. Read the current file first. Changes: (1) Replace the single `sandboxService: SandboxService` constructor param with `dockerSandboxService: DockerSandboxService` and `vmSandboxService: VmSandboxService` plus `sandboxTypeConfig: SandboxTypeConfigRepository`. (2) In prepare(), resolve sandbox type via sandboxTypeConfig.resolveSandboxType(project.id, project.workspaceId), then select the matching service. (3) Adjust MCP_SERVER_URL: Docker uses 'http://host.docker.internal:3050/mcp', VM uses the env var VM_HOST_BRIDGE_IP. (4) The rest of the flow (startSandbox, waitForSandboxToFinish, stopSandbox) stays the same since both services implement SandboxService. See plan section 7."
    status: pending
  - id: services-wiring
    content: "Update `apps/server/src/services.ts` to wire the new services. Read the current file first -- it has all the DI wiring. Changes: (1) Import and instantiate VmSandboxService with the platform-appropriate adapter (process.platform === 'darwin' for VfkitAdapter, 'linux' for CloudHypervisorAdapter). (2) Instantiate DatabaseSandboxTypeConfigRepository. (3) Update WorkflowExecutionService constructor call to pass both sandbox services + config repo (matching the workflow-refactor changes). (4) Add sandboxTypeConfigRepository and vmSandboxService to the Services interface. (5) Ensure BackgroundWorkflowProcessor.shutdown() stops both sandbox services."
    status: pending
  - id: sandbox-type-api
    content: Add HTTP API endpoints for sandbox type configuration. Read existing handler files to find where workspace and project routes are defined (look in apps/server/src/workspaces/ and apps/server/src/projects/ for handler files). Add GET/PUT endpoints for /api/workspaces/:id/sandbox-type and /api/projects/:id/sandbox-type. Require an authenticated Better Auth session, return `401` when no session is present, return `404` when the caller is not a member of the workspace, and return `404` when the caller cannot access the target project. These call SandboxTypeConfigRepository. Also add MCP tools -- read apps/server/src/projects/projects-mcp-handlers.ts for the MCP tool pattern (uses satisfies McpTool, getMcpServices(), withRequiredProjectId). Register new tools in apps/server/src/mcp.ts. The API package (packages/api) will need the SandboxType type exported -- read packages/api/AGENTS.md for cerato patterns.
    status: pending
  - id: frontend-api
    content: Add sandbox type API integration to the frontend. (1) Add the SandboxType type and API endpoint types to packages/api (read packages/api/AGENTS.md for cerato codec patterns -- first param = wire type, second = app type). (2) Create a useSandboxType hook in apps/frontend/app/lib/sandbox/useSandboxType.ts. Read apps/frontend/app/lib/projects/useProjects.ts as the pattern -- it shows how to use React Query with cerato API calls, including queries and mutations with cache invalidation.
    status: pending
  - id: frontend-ui
    content: Add sandbox type UI components and integrate into existing pages. (1) Create SandboxTypeSelect component in apps/frontend/app/components/ui/SandboxTypeSelect.tsx -- read apps/frontend/app/components/ui/HarnessSelect.tsx as the pattern (it's a dropdown select for a similar config). Options are 'Docker' and 'VM'. (2) Add SandboxTypeSelect to workspace settings, behind the authenticated app shell and current-workspace context. (3) Add SandboxTypeSelect to apps/frontend/app/components/projects/ProjectDialog.tsx -- read the file to see how HarnessSelect is integrated there and follow the same pattern. Read apps/frontend/AGENTS.md for frontend conventions.
    status: pending
  - id: docs
    content: "Create `docs/decisions/vm-sandboxing.md` documenting: why VMs (isolation, future Docker-in-VM), why Cloud Hypervisor + vfkit (virtio-fs, REST API), architecture overview (VmPlatformAdapter abstraction), setup instructions for Linux (install binaries, run networking script, build rootfs) and macOS (install vfkit via Homebrew, build rootfs). Update `docs/00-index.md` to link to the new file. Read existing decisions docs (e.g., docs/decisions/forge-authentication.md) for the style."
    status: pending
isProject: false
---

# VM-Based Sandboxes with Cloud Hypervisor and vfkit

## Context

Today, all agent runs execute inside Docker containers via `DockerSandboxService`. The `SandboxService` interface ([apps/server/src/sandbox/SandboxService.ts](apps/server/src/sandbox/SandboxService.ts)) already provides a clean abstraction with `createNewSandbox`, `startSandbox`, `stopSandbox`, `waitForSandboxToFinish`, and `stopAllSandboxes`. `WorkflowExecutionService` depends on this interface.

The Docker approach uses bind mounts to share files between host and container: the code checkout, `task.txt`, harness config files, `harness-setup.sh`, and `lifecycle.sh`. This is the primary integration point that the VM implementation must replicate.

**Why VMs:** Docker containers share the host kernel, which limits isolation. VMs provide hardware-level isolation via hardware virtualization, enabling future features like giving agents access to Docker inside their sandbox, port exposure, and snapshotting.

**Scope for v1:** Basic agent execution in a VM. Docker-in-VM, port exposure, and snapshotting are deferred.

## Design Decisions

### VM technology: Cloud Hypervisor (Linux) + vfkit (macOS)

Chosen over Firecracker (no virtio-fs support) and QEMU (slower boot, no REST API).

Both Cloud Hypervisor and vfkit:

- Support **virtio-fs** for host-guest directory sharing (works like bind mounts)
- Expose a **REST API** over Unix socket for programmatic VM lifecycle control
- Run as **one process per VM** (killing a VMM process only affects that single VM)
- Are actively maintained and production-proven

Cloud Hypervisor uses KVM on Linux. vfkit uses Apple's Virtualization.framework on macOS (hardware-accelerated on all Apple Silicon). This gives developers full VM sandbox functionality on both platforms.

A `VmPlatformAdapter` interface abstracts the differences. `VmSandboxService` delegates to the appropriate adapter.

### File sharing: virtio-fs

One virtiofsd process per sandbox (Linux) or built-in Virtualization.framework virtio-fs (macOS) shares the run's temp directory. Inside the VM, a setup script creates symlinks from the virtiofs mount to the expected container paths (`/code`, `/task.txt`, `/harness-setup.sh`, etc.).

Because virtio-fs shares the host filesystem directly, the code changes are visible to the host in real-time. The entire git push/merge flow in `workflow.onTaskCompleted()` stays unchanged.

### Init script: Option A (baked into rootfs)

A minimal init script is baked into the VM rootfs image. At boot, the kernel runs this script, which:

1. Mounts virtio-fs at `/mnt/host`
2. Execs `/mnt/host/vm-mount-setup.sh` (generated per-run by `VmSandboxService`)

This is necessary because the kernel needs to mount virtio-fs before it can access any files on the shared directory. The per-run `vm-mount-setup.sh` then creates the symlinks/copies and hands off to `lifecycle.sh`.

### Rootfs from Dockerfile

Reuse the existing `Dockerfile` to build the VM rootfs image. `docker build` + `docker export` + convert to raw disk. One source of truth for agent tooling.

### Sandbox type config: workspace + project

Stored in a new `sandbox_type_configuration` table (similar pattern to `agent_harness_configuration` but only workspace and project levels). Resolution: project overrides workspace, workspace default is `docker`.

### WorkflowExecutionService receives both sandbox services directly

`WorkflowExecutionService` receives both `DockerSandboxService` and `VmSandboxService` as explicit constructor parameters (not a factory function). This surfaces the platform-specific services for future use when platform-specific features need to be exposed (e.g., VM snapshotting, Docker exec for teardown). The service resolves the sandbox type per run and delegates to the appropriate service.

## Implementation Guide

### 1. VmPlatformAdapter Interface and Implementations

Create `apps/server/src/sandbox/vm/VmPlatformAdapter.ts`:

```typescript
interface VmPlatformAdapter {
  readonly platform: "linux" | "macos";

  isAvailable(): Promise<boolean>;

  startVirtiofsd(options: {
    socketPath: string;
    sharedDir: string;
  }): Promise<ChildProcess>;

  startVmm(options: {
    apiSocketPath: string;
    kernelPath: string;
    rootfsPath: string;
    virtiofsSocketPath: string;
    virtiofsTag: string;
    memorySizeMb: number;
    cpuCount: number;
    networkConfig: VmNetworkConfig;
  }): Promise<ChildProcess>;

  bootVm(apiSocketPath: string): Promise<void>;
  shutdownVm(apiSocketPath: string): Promise<void>;
  getVmInfo(apiSocketPath: string): Promise<VmInfo>;
}
```

`**CloudHypervisorAdapter**` (`apps/server/src/sandbox/vm/CloudHypervisorAdapter.ts`):

- `startVirtiofsd()`: Spawns `virtiofsd --socket-path=... --shared-dir=... --cache=never`
- `startVmm()`: Spawns `cloud-hypervisor --api-socket ... --kernel ... --disk path=... --fs tag=...,socket=... --memory size=...,shared=on --cpus boot=... --net ...`
- `bootVm()`: HTTP PUT to `/api/v1/vm.boot` via Unix socket
- `shutdownVm()`: HTTP PUT to `/api/v1/vm.shutdown` via Unix socket
- `getVmInfo()`: HTTP GET to `/api/v1/vm.info` via Unix socket
- `isAvailable()`: Checks for `cloud-hypervisor` binary, `virtiofsd` binary, and `/dev/kvm`

`**VfkitAdapter**` (`apps/server/src/sandbox/vm/VfkitAdapter.ts`):

- `startVirtiofsd()`: Not needed on macOS -- vfkit handles virtio-fs natively. Returns a no-op/dummy process.
- `startVmm()`: Spawns `vfkit --kernel ... --disk path=... --device virtio-fs,sharedDir=...,mountTag=... --memory ... --cpus ... --restful-uri unix://...`
- `bootVm()`: vfkit boots automatically on start (or use REST API if needed)
- `shutdownVm()`: REST API call to vfkit's endpoint
- `getVmInfo()`: REST API call
- `isAvailable()`: Checks for `vfkit` binary (installable via Homebrew)

Both adapters use Node.js `http.request` with `socketPath` to communicate over Unix sockets. Define typed request/response interfaces for each VMM's REST API.

### 2. VmSandboxService

Create `apps/server/src/sandbox/vm/VmSandboxService.ts` implementing `SandboxService`.

Internal state per sandbox (tracked in a `Map<SandboxId, VmSandboxState>`):

- `virtiofsdProcess: ChildProcess | null` (null on macOS where vfkit handles it)
- `vmmProcess: ChildProcess`
- `apiSocketPath: string`
- `virtiofsdSocketPath: string`
- `sharedDir: string`

`**createNewSandbox(options)`:**

1. Determine the common parent of all volume host paths (the run's temp directory, e.g., `.devloop/runs/{runId}/`)
2. Generate unique socket paths: `/tmp/ch-{uuid}.sock`, `/tmp/virtiofs-{uuid}.sock`
3. Start virtiofsd via adapter (shares the temp directory)
4. Generate `vm-mount-setup.sh` in the shared temp directory:
  - For each volume in `options.volumes`, computes the relative path from the shared temp dir and creates a symlink or copy:
    - Directory volumes (e.g., `/code`): `ln -s /mnt/host/code /code`
    - File volumes at standard root paths (e.g., `/task.txt`): `ln -s /mnt/host/task.txt /task.txt`
    - File volumes at non-standard paths (e.g., `/root/.config/opencode/opencode.json`): `mkdir -p /root/.config/opencode && cp /mnt/host/harness/harness-0-opencode.json /root/.config/opencode/opencode.json`
  - Sets environment variables from `options.env` (exports them inline before running lifecycle.sh)
  - Execs `/mnt/host/{relative path to lifecycle.sh}` (lifecycle.sh is in the shared dir because it's mounted as a volume by WorkflowExecutionService)
5. Start VMM process via adapter (configured but not yet booted if the adapter supports two-phase start)
6. Return `{ id, name }` as `Sandbox`

**Concrete example of vm-mount-setup.sh generation:**

Given these volumes from `WorkflowExecutionService.prepare()`:

```
volumes = [
  { hostPath: "/abs/.devloop/runs/abc123/code", containerPath: "/code" },
  { hostPath: "/abs/.devloop/runs/abc123/task.txt", containerPath: "/task.txt" },
  { hostPath: "/abs/.devloop/runs/abc123/harness/harness-0-opencode.json", containerPath: "/root/.config/opencode/opencode.json", mode: "ro" },
  { hostPath: "/abs/.devloop/runs/abc123/harness-setup.sh", containerPath: "/harness-setup.sh" },
]
```

The shared directory is `/abs/.devloop/runs/abc123/` (common parent). The generated `vm-mount-setup.sh`:

```bash
#!/bin/sh
set -e
# /mnt/host is already mounted by vm-init.sh

# Map volumes
ln -s /mnt/host/code /code
ln -s /mnt/host/task.txt /task.txt
mkdir -p /root/.config/opencode
cp /mnt/host/harness/harness-0-opencode.json /root/.config/opencode/opencode.json
ln -s /mnt/host/harness-setup.sh /harness-setup.sh

# Export environment
export AGENT_RUN_COMMAND='opencode run "..."'

# Hand off to lifecycle script (also on the shared mount)
exec /mnt/host/lifecycle.sh
```

Note: `lifecycle.sh` ends up in the shared dir because `WorkflowExecutionService` mounts it as a volume too. The VM service needs to handle mapping it the same way.

`**startSandbox(id)`:** Call `adapter.bootVm(apiSocketPath)`. Capture VMM stdout/stderr for logging (equivalent to `DockerLoggingService`).

`**waitForSandboxToFinish(id)`:** Monitor the VMM child process for exit via Node.js `child_process` 'exit' event. When the VM's init process exits (lifecycle.sh completes), the VM shuts down, and the VMM process exits. Return exit code.

`**stopSandbox(id)`:**

1. Try graceful shutdown: `adapter.shutdownVm(apiSocketPath)`
2. Wait up to 30 seconds for the VMM process to exit
3. If still running, `vmmProcess.kill('SIGKILL')` -- this only kills this single VM
4. Kill virtiofsd process (if applicable)
5. Clean up socket files
6. Remove from tracked sandboxes

`**stopAllSandboxes()`:** Iterate all tracked sandboxes and call `stopSandbox()`.

### 3. Baked-in Rootfs Init Script

Create `apps/server/src/sandbox/vm/vm-init.sh` (added to rootfs at `/sbin/vm-init`):

```bash
#!/bin/sh
mount -t proc proc /proc
mount -t sysfs sys /sys
mount -t devtmpfs dev /dev

# Mount virtio-fs shared directory from host
mkdir -p /mnt/host
mount -t virtiofs hostshare /mnt/host

# Hand off to the per-run setup script
exec /mnt/host/vm-mount-setup.sh
```

The kernel boot args set `init=/sbin/vm-init`.

### 4. VM Rootfs Build Tooling

Create `scripts/build-vm-rootfs.sh`:

1. Build the Docker image: `docker build -t my-agent-loop .`
2. Create and export: `docker create --name rootfs-export my-agent-loop && docker export rootfs-export > rootfs.tar`
3. Create raw disk image:

```bash
   truncate -s 10G rootfs.raw
   mkfs.ext4 rootfs.raw
   mkdir -p /tmp/rootfs-mount
   mount rootfs.raw /tmp/rootfs-mount
   tar -xf rootfs.tar -C /tmp/rootfs-mount


```

1. Add the baked-in init script (`vm-init.sh`) to `/sbin/vm-init` in the rootfs, make executable
2. Unmount: `umount /tmp/rootfs-mount`
3. Clean up: `docker rm rootfs-export && rm rootfs.tar`

Kernel: Download pre-built kernel from `https://github.com/cloud-hypervisor/linux/releases`. For macOS/vfkit, may need an ARM64 kernel if running on Apple Silicon.

Add `pnpm vm:build-rootfs` to root `package.json`.

### 5. Host Networking Setup

**Linux** -- Create `scripts/setup-vm-networking.sh` (run once):

1. Create a bridge: `ip link add br0 type bridge`
2. Assign IP: `ip addr add 192.168.100.1/24 dev br0`
3. Enable the bridge: `ip link set br0 up`
4. Enable IP forwarding: `sysctl -w net.ipv4.ip_forward=1`
5. Set up NAT: `iptables -t nat -A POSTROUTING -s 192.168.100.0/24 -j MASQUERADE`

Cloud Hypervisor TAP devices connect to this bridge. Each VM gets an IP in the 192.168.100.0/24 range.

**macOS** -- vfkit uses Apple's Virtualization.framework built-in NAT networking. No manual bridge setup needed. The VM gets an IP on a private subnet managed by the framework.

VMs need network access for:

- Reaching the MCP server on the host
- Internet access for agent operations (e.g., `pnpm install` in setup.sh, API calls from agent tools like Claude Code reaching Anthropic's API)

The MCP server URL for VM sandboxes:

- **Linux**: `http://192.168.100.1:3050/mcp` (host's bridge IP)
- **macOS**: Needs discovery -- either a known gateway IP from vfkit's NAT, or the host's LAN IP

### 6. Sandbox Type Configuration

**Database** -- new table in [apps/server/src/db/schema.ts](apps/server/src/db/schema.ts):

```typescript
export const sandboxTypeEnum = pg.pgEnum("sandbox_type", ["docker", "vm"]);

export const sandboxTypeConfigurationTable = pg.pgTable(
  "sandbox_type_configuration",
  {
    id: pg.uuid().primaryKey().default(sql`uuidv7()`),
    workspaceId: pg.uuid().references(() => workspacesTable.id).unique().$type<WorkspaceId>(),
    projectId: pg.uuid().references(() => projectsTable.id).unique().$type<ProjectId>(),
    sandboxType: sandboxTypeEnum().notNull(),
  },
  (table) => ({
    exactlyOneTarget: check(
      "sandbox_type_config_exactly_one_target",
      sql`(num_nonnulls(${table.workspaceId}, ${table.projectId}) = 1)`,
    ),
  }),
);
```

Note: The enum uses `"vm"` rather than `"cloud-hypervisor"` since the VMM backend is a platform detail, not a user-facing choice. Users choose between Docker and VM; the platform adapter handles the rest.

**Repository** -- create `apps/server/src/sandbox/SandboxTypeConfigRepository.ts`:

- `resolveSandboxType(projectId, workspaceId): Promise<SandboxType>` -- project overrides workspace, default is `docker`
- `setSandboxType(target: { workspaceId } | { projectId }, type: SandboxType): Promise<void>`
- Follow the same pattern as [AgentHarnessConfigRepository](apps/server/src/harness/AgentHarnessConfigRepository.ts)

**API** -- add endpoints to workspace and project handlers:

- `GET /api/workspaces/:id/sandbox-type`
- `PUT /api/workspaces/:id/sandbox-type`
- `GET /api/projects/:id/sandbox-type`
- `PUT /api/projects/:id/sandbox-type`

These endpoints must follow the new auth model:

- return `401` when there is no authenticated Better Auth session
- return `404` when the caller is not a member of the target workspace
- return `404` when the caller cannot access the target project

**MCP tools** -- add sandbox type management to MCP handlers following existing patterns.

### 7. WorkflowExecutionService Refactoring

Changes to [apps/server/src/workflow/WorkflowExecutionService.ts](apps/server/src/workflow/WorkflowExecutionService.ts):

- Replace `private readonly sandboxService: SandboxService` with two explicit services:

```typescript
  constructor(
    // ...existing params...
    private readonly dockerSandboxService: DockerSandboxService,
    private readonly vmSandboxService: VmSandboxService,
    private readonly sandboxTypeConfig: SandboxTypeConfigRepository,
  ) {}


```

- In `prepare()`, resolve sandbox type and select the appropriate service:

```typescript
  const sandboxType = await this.sandboxTypeConfig.resolveSandboxType(
    project.id, project.workspaceId
  );
  const sandboxService = sandboxType === "docker"
    ? this.dockerSandboxService
    : this.vmSandboxService;


```

- Store the selected `sandboxService` so `processTask()` can use it for `startSandbox()`, `waitForSandboxToFinish()`, and `stopSandbox()`
- Adjust `MCP_SERVER_URL` based on sandbox type:
  - Docker: `http://host.docker.internal:3050/mcp` (unchanged)
  - VM on Linux: `http://192.168.100.1:3050/mcp` (host bridge IP, from env)
  - VM on macOS: host IP on vfkit NAT (from env)

### 8. services.ts Wiring

Update [apps/server/src/services.ts](apps/server/src/services.ts):

- Detect platform: `process.platform === "darwin"` for macOS, `"linux"` for Linux
- Instantiate the appropriate adapter:

```typescript
  const vmPlatformAdapter = process.platform === "darwin"
    ? new VfkitAdapter(env.VFKIT_PATH)
    : new CloudHypervisorAdapter(env.CLOUD_HYPERVISOR_PATH, env.VIRTIOFSD_PATH);


```

- Instantiate `VmSandboxService` with the adapter and paths (kernel, rootfs)
- Pass both `DockerSandboxService` and `VmSandboxService` to `WorkflowExecutionService`
- Pass both to `BackgroundWorkflowProcessor` for shutdown
- Add `SandboxTypeConfigRepository` to `Services` interface

### 9. Environment and Configuration

Add to `apps/server/src/env.ts`:

- `VM_KERNEL_PATH` -- path to the VM kernel binary
- `VM_ROOTFS_PATH` -- path to the VM rootfs image
- `VIRTIOFSD_PATH` -- path to virtiofsd binary (Linux only)
- `CLOUD_HYPERVISOR_PATH` -- path to cloud-hypervisor binary (Linux only)
- `VFKIT_PATH` -- path to vfkit binary (macOS only)
- `VM_HOST_BRIDGE_IP` -- host IP reachable from VM (default `192.168.100.1` on Linux)

All optional. `VmSandboxService` reports unavailability if required binaries/paths are missing.

### 10. Frontend Changes

Follow existing patterns in `apps/frontend/`:

- **SandboxTypeSelect component** -- similar to [HarnessSelect.tsx](apps/frontend/app/components/ui/HarnessSelect.tsx), a dropdown with "Docker" and "VM" options
- **Workspace settings** -- add sandbox type selector
- **Project dialog** -- add sandbox type selector to [ProjectDialog.tsx](apps/frontend/app/components/projects/ProjectDialog.tsx)
- **API hooks** -- add `useSandboxType` hook following the pattern in [useProjects.ts](apps/frontend/app/lib/projects/useProjects.ts)

The sandbox-type selectors should only render inside the authenticated app shell after the current workspace has been resolved from the caller's memberships.

## Future Paths (informational, not in scope for v1)

### Log Streaming

The architecture supports multiple paths for streaming agent run logs from VMs:

- **virtio-fs based (simplest):** Agent output written to a log file on the shared directory. The host tails the file in real-time since it's visible via virtio-fs. Analogous to the existing `DockerLoggingService` but file-based.
- **Serial console:** Both Cloud Hypervisor and vfkit can redirect serial output to a file/pipe. Captures all console output.
- **vsock:** Both VMMs support virtio-vsock for direct host-guest socket communication. A lightweight daemon inside the VM could stream structured logs.

### Dynamic Port Exposure

The VM sits on a bridge/NAT network and has its own IP. Services running inside the VM are reachable from the host:

- **Direct access via VM IP:** On Linux, the host can connect to any port on the VM's bridge IP. A reverse proxy could dynamically route traffic.
- **iptables forwarding:** Dynamically add iptables rules to forward host ports to VM ports.
- **vsock tunneling:** Forward traffic over vsock without network configuration.

### Docker-in-VM

Since VMs have their own kernel, Docker can run natively inside the VM. The rootfs build would need to include Docker/containerd. This is the primary long-term motivation for VM sandboxes.

## Edge Cases and Error Handling

- **VM binaries not available:** `VmSandboxService` (via adapter) detects missing binaries at startup and reports unavailability. Attempting to use VM sandboxes when unavailable returns a clear error. The frontend could grey out the VM option.
- **virtiofsd crash (Linux):** If virtiofsd dies, the VM loses filesystem access. Monitor the virtiofsd process alongside the VMM process. If either dies unexpectedly, mark the run as failed.
- **VM fails to boot:** Use the REST API to check VM state after boot. If the VM doesn't transition to "Running" within a timeout (e.g., 30s), kill processes and fail the run.
- **Orphaned processes:** `stopAllSandboxes()` must kill both VMM and virtiofsd processes for all tracked sandboxes. Track child process PIDs.
- **Networking not configured (Linux):** If the bridge is not set up, VM creation should fail with a descriptive error explaining how to run the setup script.
- **Teardown on timeout:** For v1, if a VM run times out, the VMM process is killed directly. Teardown scripts do not run in this case (acceptable for v1; the Docker path has the same limitation when a container is force-killed). Future improvement: send a command into the VM via vsock or serial before killing.
- **Concurrent VMs:** Each VM has its own VMM process, virtiofsd, and sockets. No shared state between VMs. Concurrency is bounded by the same BullMQ worker concurrency (currently 5).

## Out of Scope

- Docker-in-VM support (future -- primary motivation for VMs)
- Port exposure from VM to host (future)
- VM snapshotting / freezing agent state (future)
- OverlayFS optimization for shared rootfs across VMs (optimization for scale)
- QEMU or Firecracker as alternative VMM backends
- Automated host networking setup (manual setup with documented script for v1)
- In-VM log streaming daemon (v1 uses serial console or file-based approach)
