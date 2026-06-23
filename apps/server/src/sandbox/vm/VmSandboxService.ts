import type { ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Logger } from "../../logger/Logger";
import { absolutePath } from "../../utils/absolutePath";
import type { Result } from "../../utils/Result";
import type {
  Sandbox,
  SandboxId,
  SandboxInitOptions,
  SandboxService,
  StartSandboxFailure,
  WaitForSandboxToFinishFailure,
  WaitForSandboxToFinishSuccess,
} from "../SandboxService";
import type { VmNetworkConfig, VmPlatformAdapter } from "./VmPlatformAdapter";

// The virtio-fs mount tag must match the tag used in vm-init.sh, which passes "hostshare" to
// `mount -t virtiofs`. Any mismatch would silently cause the mount to fail at boot time.
const VIRTIOFS_TAG = "hostshare";

// The guest writes lifecycle.sh's exit code to this file in the shared dir before powering off.
// A VM has no equivalent of a container exit code (the VMM process exiting does not carry the
// workload's status), so we pass the result back through virtio-fs and read it on the host.
export const EXIT_CODE_FILENAME = ".vm-exit-code";

interface VmSandboxState {
  // null on macOS where vfkit handles virtio-fs natively (no separate virtiofsd process)
  virtiofsdProcess: ChildProcess | null;
  vmmProcess: ChildProcess;
  apiSocketPath: string;
  virtiofsdSocketPath: string;
  sharedDir: string;
  // File the guest serial console is written to, for debugging and (future) log streaming.
  consoleLogPath: string;
  // Per-run copy-on-write clone of the base rootfs this VM boots from. Deleted when the sandbox's
  // resources are released (after it finishes or is stopped). Each VM gets its own so concurrent
  // runs don't contend for exclusive read-write access to one disk image.
  runRootfsPath: string;
}

export interface VmSandboxServiceOptions {
  memorySizeMb?: number;
  cpuCount?: number;
  networkConfig?: VmNetworkConfig;
}

const DEFAULT_MEMORY_SIZE_MB = 2048;
const DEFAULT_CPU_COUNT = 2;

export interface GitWorktreeEntry {
  path: string;
  branch?: string;
}

export interface VmImagePathResolution {
  path: string;
  checkedPaths: string[];
}

export function parseGitWorktreeListPorcelain(
  output: string,
): GitWorktreeEntry[] {
  const entries: GitWorktreeEntry[] = [];
  let current: GitWorktreeEntry | undefined;

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current !== undefined) entries.push(current);
      current = { path: line.slice("worktree ".length) };
      continue;
    }
    if (line.startsWith("branch ") && current !== undefined) {
      current.branch = line.slice("branch ".length);
    }
  }

  if (current !== undefined) entries.push(current);
  return entries;
}

function readGitWorktrees(): GitWorktreeEntry[] {
  try {
    return parseGitWorktreeListPorcelain(
      execFileSync("git", ["worktree", "list", "--porcelain"], {
        cwd: process.cwd(),
        encoding: "utf8",
      }),
    );
  } catch {
    return [];
  }
}

function pathContains(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === "" ||
    (relative.length > 0 &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative))
  );
}

function findOwningWorktree(
  candidatePath: string,
  worktrees: GitWorktreeEntry[],
): GitWorktreeEntry | undefined {
  return worktrees
    .filter((entry) => pathContains(entry.path, candidatePath))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

function findMainCheckout(
  worktrees: GitWorktreeEntry[],
): GitWorktreeEntry | undefined {
  return (
    worktrees.find((entry) => entry.branch === "refs/heads/main") ??
    worktrees[0]
  );
}

export function resolveVmImagePath(
  configuredPath: string,
  options: {
    exists?: (path: string) => boolean;
    worktrees?: GitWorktreeEntry[];
  } = {},
): VmImagePathResolution {
  const exists = options.exists ?? fs.existsSync;
  const checkedPaths = [configuredPath];
  if (exists(configuredPath)) {
    return { path: configuredPath, checkedPaths };
  }

  const worktrees = options.worktrees ?? readGitWorktrees();
  const owningWorktree = findOwningWorktree(configuredPath, worktrees);
  const mainCheckout = findMainCheckout(worktrees);
  if (
    owningWorktree === undefined ||
    mainCheckout === undefined ||
    path.resolve(owningWorktree.path) === path.resolve(mainCheckout.path)
  ) {
    return { path: configuredPath, checkedPaths };
  }

  const relativePath = path.relative(owningWorktree.path, configuredPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return { path: configuredPath, checkedPaths };
  }

  const fallbackPath = path.join(mainCheckout.path, relativePath);
  if (!checkedPaths.includes(fallbackPath)) {
    checkedPaths.push(fallbackPath);
  }
  if (exists(fallbackPath)) {
    return { path: fallbackPath, checkedPaths };
  }

  return { path: configuredPath, checkedPaths };
}

function requireResolvedVmImagePath(
  label: string,
  configuredPath: string,
  worktrees: GitWorktreeEntry[],
): string {
  const resolution = resolveVmImagePath(configuredPath, { worktrees });
  if (fs.existsSync(resolution.path)) {
    return resolution.path;
  }

  throw new Error(
    `${label} not found. Checked: ${resolution.checkedPaths.join(", ")}`,
  );
}

/**
 * Single-quote-escapes a shell value so it can be safely embedded in an export statement.
 * Single quotes in the value are escaped by ending the single-quoted string, inserting the
 * literal quote, then resuming the single-quoted string — the POSIX-standard technique.
 * This matches the shellQuote helper in WorkflowExecutionService.
 */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/**
 * Determines the deepest common ancestor directory shared by all given absolute paths.
 * Returns undefined when the array is empty or no common prefix can be found.
 *
 * This is used to identify the shared run temp directory that is mounted into the VM via
 * virtio-fs. All volume host paths must live inside that directory so the VM can reach them
 * through /mnt/host.
 */
export function findCommonParentDir(
  absolutePaths: readonly string[],
): string | undefined {
  if (absolutePaths.length === 0) return undefined;

  // Split each path into its directory segments, normalising trailing slashes first.
  const segmentGroups = absolutePaths.map((p) =>
    path.dirname(p).split(path.sep).filter(Boolean),
  );

  // Walk the first group's segments, stopping when another group diverges.
  const reference = segmentGroups[0];
  let commonLength = reference.length;
  for (let i = 1; i < segmentGroups.length; i++) {
    const group = segmentGroups[i];
    let matchLength = 0;
    while (
      matchLength < commonLength &&
      matchLength < group.length &&
      reference[matchLength] === group[matchLength]
    ) {
      matchLength++;
    }
    commonLength = matchLength;
  }

  if (commonLength === 0) return undefined;

  // Reconstruct the common path. On POSIX the leading separator must be re-added.
  return path.sep + reference.slice(0, commonLength).join(path.sep);
}

/**
 * Generates the content of the per-run vm-mount-setup.sh script.
 *
 * This is a pure function so it can be unit-tested in isolation without spawning any processes.
 *
 * The script:
 * 1. Creates symlinks or copies for each volume so the VM sees the same paths as Docker would.
 * 2. Exports environment variables needed by the agent.
 * 3. Runs lifecycle.sh, records its exit code on the shared mount, and powers the VM off.
 *
 * Mapping rules (mirroring the Docker bind-mount behaviour):
 * - Directory volumes → symlink: `rm -rf <containerPath>` then `ln -s /mnt/host/<rel> <containerPath>`
 * - File volumes at standard root paths (single path segment, e.g. /task.txt) → rm + symlink
 * - File volumes at non-standard nested paths (e.g. /root/.config/…) → mkdir -p + cp
 *
 * Each root-level target is removed before the symlink because the rootfs ships some of these paths
 * (e.g. /code is the image WORKDIR) and the disk is attached read-write and reused across runs —
 * `ln -s` into an existing directory would create <dir>/<name> and then fail on the next run.
 *
 * This script runs as PID 1 after switch_root, so it must NEVER use `set -e`: if PID 1 exits the
 * kernel panics and the VMM process hangs (leaking it and holding the rootfs image, which blocks all
 * later runs). Every step therefore falls through to the controlled power-off, and a setup failure is
 * recorded as a non-zero exit code rather than aborting.
 *
 * @param volumes     The SandboxInitOptions volumes array (may be undefined/empty).
 * @param env         The SandboxInitOptions env map (may be undefined/empty).
 * @param sharedDir   The host directory shared into the VM at /mnt/host.
 * @param lifecycleRelativePath  Path to lifecycle.sh relative to sharedDir, run as the final step.
 */
export function generateVmMountSetupScript(
  volumes: SandboxInitOptions["volumes"],
  env: SandboxInitOptions["env"],
  sharedDir: string,
  lifecycleRelativePath: string,
): string {
  const lines: string[] = [
    "#!/bin/sh",
    "# No `set -e`: this runs as PID 1, so any uncaught error that exits the shell panics the kernel",
    "# and hangs the VMM. We track failures instead and always reach the power-off below.",
    "# /mnt/host is already mounted by vm-init.sh",
    "SETUP_EXIT_CODE=0",
    "",
    "# Map volumes",
  ];

  for (const volume of volumes ?? []) {
    // Compute the path of the volume's host file/dir relative to the shared directory.
    // /mnt/host is the in-VM mount point, so /mnt/host/<rel> reaches the file.
    const relPath = path.relative(sharedDir, volume.hostPath);
    const vmSourcePath = `/mnt/host/${relPath}`;
    const containerPath = volume.containerPath;

    // Determine whether this is a "standard root path" (single path segment after '/'):
    // e.g. /code, /task.txt, /harness-setup.sh are standard; /root/.config/… is not.
    // Standard paths get a symlink; non-standard nested paths get mkdir -p + cp so the
    // parent directory exists before the file is placed.
    const isAtRootLevel = path.dirname(containerPath) === "/";

    // Quote every path operand: the run temp dir (and so the /mnt/host-relative source paths) can
    // contain spaces or other shell-special characters, and an unquoted, word-split path argument
    // to `rm -rf` is the worst place to find that out.
    const quotedSource = shellQuote(vmSourcePath);
    const quotedTarget = shellQuote(containerPath);

    if (isAtRootLevel) {
      // Remove any pre-existing target first so the mapping is idempotent across reused rootfs disks
      // and does not collide with image-provided directories like /code.
      lines.push(`rm -rf ${quotedTarget}`);
      lines.push(`ln -s ${quotedSource} ${quotedTarget} || SETUP_EXIT_CODE=1`);
    } else {
      const parentDir = path.dirname(containerPath);
      lines.push(`mkdir -p ${shellQuote(parentDir)}`);
      lines.push(`cp ${quotedSource} ${quotedTarget} || SETUP_EXIT_CODE=1`);
    }
  }

  lines.push("");
  lines.push("# Export environment");
  for (const [key, value] of Object.entries(env ?? {})) {
    lines.push(`export ${key}=${shellQuote(value)}`);
  }

  // Booting the rootfs as a raw disk does not apply the Docker image's runtime config (its ENV and
  // WORKDIR), so the guest would otherwise have no HOME and a cwd of /. That makes tools misbehave
  // exactly as under Docker they would not: nvm installs into //.nvm and project setup scripts run
  // `pnpm install` in / where there is no package.json. Replicate the parts the agent tooling needs.
  // HOME/PATH mirror the Dockerfile (root user, /root/.opencode/bin etc.); /code is the repo mount,
  // the same WORKDIR the image uses and the path the server always mounts the checkout at.
  lines.push("");
  lines.push(
    "# Match the Docker image runtime environment (HOME, PATH, WORKDIR)",
  );
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion syntax, not a JS template literal
  lines.push('export HOME="${HOME:-/root}"');
  lines.push('export PATH="/root/.local/bin:/root/.opencode/bin:$PATH"');
  lines.push("cd /code 2>/dev/null || cd /");

  // lifecycle.sh is copied into the shared dir by VmSandboxService.createNewSandbox, so it is
  // reachable through /mnt/host like everything else.
  //
  // We deliberately do NOT `exec` it: this script runs as PID 1 (after switch_root), and if PID 1
  // exits the kernel panics and the VM hangs instead of shutting down. Instead we run lifecycle.sh
  // (only when volume setup succeeded — a broken mount would otherwise produce a misleading run
  // failure), record its exit code on the shared mount (the VMM's own exit code can't carry it
  // back), flush, and power the VM off cleanly via magic sysrq so the host detects completion.
  lines.push("");
  lines.push(
    "# Run the lifecycle script, capturing its exit code for the host to read.",
  );
  lines.push('if [ "$SETUP_EXIT_CODE" -eq 0 ]; then');
  lines.push(`  ${shellQuote(`/mnt/host/${lifecycleRelativePath}`)}`);
  lines.push("  LIFECYCLE_EXIT_CODE=$?");
  lines.push("else");
  lines.push(
    "  echo 'vm-mount-setup: volume mapping failed; skipping lifecycle' >&2",
  );
  lines.push("  LIFECYCLE_EXIT_CODE=$SETUP_EXIT_CODE");
  lines.push("fi");
  lines.push(`echo "$LIFECYCLE_EXIT_CODE" > /mnt/host/${EXIT_CODE_FILENAME}`);
  lines.push("sync");
  lines.push("");
  lines.push(
    "# Power off so the VMM process exits (PID 1 must not just return — that panics the kernel).",
  );
  lines.push(
    "echo o > /proc/sysrq-trigger 2>/dev/null || halt -f 2>/dev/null || poweroff -f 2>/dev/null || true",
  );

  return `${lines.join("\n")}\n`;
}

/**
 * Whether the child process has already terminated, however it terminated. Node leaves exitCode
 * null when a process dies from a signal (signalCode is set instead), so checking exitCode alone
 * misses signal-killed VMMs — and then waits on an "exit" event that already fired.
 */
function hasProcessExited(process: ChildProcess): boolean {
  return process.exitCode !== null || process.signalCode !== null;
}

/**
 * Reads the lifecycle exit code the guest wrote to the shared dir before powering off.
 * Returns undefined when the file is missing or unparseable (the run did not finish normally).
 */
export function readGuestExitCode(sharedDir: string): number | undefined {
  try {
    const raw = fs
      .readFileSync(path.join(sharedDir, EXIT_CODE_FILENAME), "utf8")
      .trim();
    const code = Number.parseInt(raw, 10);
    return Number.isNaN(code) ? undefined : code;
  } catch {
    return undefined;
  }
}

export class VmSandboxService implements SandboxService {
  private readonly knownSandboxes = new Map<SandboxId, VmSandboxState>();
  private readonly memorySizeMb: number;
  private readonly cpuCount: number;
  private readonly networkConfig: VmNetworkConfig;

  constructor(
    private readonly adapter: VmPlatformAdapter,
    // Paths are optional in env (VM sandboxes may not be configured on all deployments), so we
    // accept undefined here and validate at the point where a sandbox is actually requested — not
    // at construction time, since the service is always instantiated even when VM sandboxes are
    // not in use. The guard in createNewSandbox surfaces a clear error naming the missing vars.
    private readonly kernelPath: string | undefined,
    private readonly rootfsPath: string | undefined,
    private readonly initrdPath: string | undefined,
    private readonly logger: Logger,
    options: VmSandboxServiceOptions = {},
  ) {
    this.memorySizeMb = options.memorySizeMb ?? DEFAULT_MEMORY_SIZE_MB;
    this.cpuCount = options.cpuCount ?? DEFAULT_CPU_COUNT;
    this.networkConfig = options.networkConfig ?? {};
  }

  async createNewSandbox(options: SandboxInitOptions): Promise<Sandbox> {
    // Validate required paths before doing any work. These come from optional env vars, so they may
    // be absent when the server runs without VM sandbox support configured. Fail fast with a clear
    // error rather than propagating undefined into the adapter or spawning processes that will crash.
    if (
      this.kernelPath === undefined ||
      this.rootfsPath === undefined ||
      this.initrdPath === undefined
    ) {
      throw new Error(
        "VM sandbox requires VM_KERNEL_PATH, VM_ROOTFS_PATH and VM_INITRD_PATH to be configured",
      );
    }

    // After the guard above, TypeScript still sees the fields as string | undefined because they
    // are instance properties. Shadow them as narrowed locals so the rest of the method is typed.
    const worktrees = readGitWorktrees();
    const kernelPath = requireResolvedVmImagePath(
      "VM kernel image",
      this.kernelPath,
      worktrees,
    );
    const rootfsPath = requireResolvedVmImagePath(
      "VM rootfs image",
      this.rootfsPath,
      worktrees,
    );
    const initrdPath = requireResolvedVmImagePath(
      "VM initrd image",
      this.initrdPath,
      worktrees,
    );

    const volumes = options.volumes ?? [];

    // The shared directory is the common parent of the run's volume host paths.
    // WorkflowExecutionService places all of them inside the run's temp directory, so their common
    // parent IS that temp dir — which is exactly the directory we expose to the VM via virtio-fs at
    // /mnt/host. We must NOT include lifecycle.sh's source path in this computation: it lives in the
    // app source tree, far from the run temp dir, and would collapse the shared dir to a shallow
    // common ancestor (sharing far too much of the host and breaking the /mnt/host/<file> mapping).
    const sharedDir = findCommonParentDir(volumes.map((v) => v.hostPath));
    if (sharedDir === undefined) {
      throw new Error(
        "VmSandboxService: cannot determine shared directory — no volumes provided or host paths have no common parent",
      );
    }

    // lifecycle.sh lives in the app source tree (a sibling of SandboxService.ts, one level up from
    // this vm/ directory), not in the run temp dir. The Docker path bind-mounts it directly, but
    // virtio-fs shares only a single directory, so everything the VM needs must live under sharedDir.
    // Copy lifecycle.sh into the shared dir so it is reachable at /mnt/host/lifecycle.sh, which is
    // what the generated setup script execs.
    const lifecycleSourcePath = absolutePath(
      import.meta.url,
      "../lifecycle.sh",
    );
    const lifecycleRelativePath = "lifecycle.sh";
    fs.copyFileSync(
      lifecycleSourcePath,
      path.join(sharedDir, lifecycleRelativePath),
    );

    const uuid = randomUUID();
    const shortId = uuid.slice(0, 8);
    const id = `vm-sandbox-${uuid}` as SandboxId;

    // Socket paths under the OS temp dir — one per sandbox to avoid conflicts between concurrent VMs.
    const apiSocketPath = path.join(os.tmpdir(), `ch-${uuid}.sock`);
    const virtiofsdSocketPath = path.join(os.tmpdir(), `virtiofs-${uuid}.sock`);
    // The VMM writes the guest serial console here (vfkit cannot use a stdio console headless).
    const consoleLogPath = path.join(os.tmpdir(), `vm-console-${uuid}.log`);
    // Per-run writable disk; see the comment ahead of cloneRootfs below.
    const runRootfsPath = path.join(
      path.dirname(rootfsPath),
      `.vm-rootfs-${uuid}.raw`,
    );

    // Everything from here to startVmm creates host-side resources before the sandbox is
    // registered in knownSandboxes — so on failure, stopSandbox can never reach them. Reclaim
    // them here and rethrow rather than leaking a process, a rootfs clone, or shared-dir files.
    let virtiofsdProcess: ChildProcess | null = null;
    let vmmProcess: ChildProcess;
    try {
      // Start virtiofsd first so the socket is ready before the VMM connects to it.
      // On macOS this returns null (vfkit handles virtio-fs via Virtualization.framework).
      virtiofsdProcess = await this.adapter.startVirtiofsd({
        socketPath: virtiofsdSocketPath,
        sharedDir,
      });

      // Write the per-run setup script into the shared directory so vm-init.sh can exec it.
      const setupScriptPath = path.join(sharedDir, "vm-mount-setup.sh");
      const scriptContent = generateVmMountSetupScript(
        volumes,
        options.env,
        sharedDir,
        lifecycleRelativePath,
      );
      fs.writeFileSync(setupScriptPath, scriptContent, { mode: 0o755 });

      // Give each VM its own writable disk. Virtualization.framework (and KVM) require exclusive
      // read-write access to a disk image, so attaching the single base rootfs.raw to more than one VM
      // at once fails with "storage device attachment is invalid" and serialises every run. The adapter
      // clones the base per sandbox using a platform copy-on-write clone (APFS clonefile / reflink) so
      // it is effectively instant and space-free. The clone lives beside the base so it lands on the
      // same filesystem (CoW only works within one volume); resource release deletes it.
      await this.adapter.cloneRootfs(rootfsPath, runRootfsPath);

      vmmProcess = await this.adapter.startVmm({
        apiSocketPath,
        kernelPath,
        rootfsPath: runRootfsPath,
        initrdPath,
        virtiofsSocketPath: virtiofsdSocketPath,
        // VIRTIOFS_TAG must match the tag in vm-init.sh; mismatches cause a silent mount failure.
        virtiofsTag: VIRTIOFS_TAG,
        memorySizeMb: this.memorySizeMb,
        cpuCount: this.cpuCount,
        networkConfig: this.networkConfig,
        sharedDir,
        consoleLogPath,
      });
    } catch (error) {
      this.releaseSandboxResources(id, {
        virtiofsdProcess,
        apiSocketPath,
        virtiofsdSocketPath,
        sharedDir,
        consoleLogPath,
        runRootfsPath,
      });
      this.logger.error(
        "Failed to create VM sandbox, released partial resources",
        {
          sandboxId: id,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }

    // A post-spawn "error" event (e.g. a later failed kill) with no listener is an unhandled
    // EventEmitter error that would crash the whole server, so route it to the logger instead.
    const logProcessError = (processName: string) => (error: Error) => {
      this.logger.warn("VM sandbox process emitted an error", {
        sandboxId: id,
        processName,
        error: error.message,
      });
    };
    vmmProcess.on("error", logProcessError("vmm"));
    virtiofsdProcess?.on("error", logProcessError("virtiofsd"));

    this.knownSandboxes.set(id, {
      virtiofsdProcess,
      vmmProcess,
      apiSocketPath,
      virtiofsdSocketPath,
      sharedDir,
      consoleLogPath,
      runRootfsPath,
    });

    this.logger.info("Created VM sandbox", {
      sandboxId: id,
      platform: this.adapter.platform,
      sharedDir,
      // Per-run rootfs clone so concurrent VMs each get an exclusively-attachable disk.
      runRootfsPath,
      // virtiofsd only runs on Linux; on macOS vfkit handles virtio-fs natively (process is null).
      virtiofsdStarted: virtiofsdProcess !== null,
    });

    return { id, name: `vm-${shortId}` };
  }

  async startSandbox(
    id: SandboxId,
  ): Promise<Result<"started", StartSandboxFailure>> {
    const state = this.knownSandboxes.get(id);
    if (state === undefined) {
      this.logger.warn("Could not start VM sandbox, sandbox not found", {
        sandboxId: id,
      });
      return { success: false, error: { reason: "container-not-found" } };
    }

    // Check whether the VMM process has already exited — that would mean the VM
    // was never in a startable state (e.g. failed to spawn).
    if (hasProcessExited(state.vmmProcess)) {
      this.logger.warn(
        "Could not start VM sandbox, VMM process already exited",
        {
          sandboxId: id,
          exitCode: state.vmmProcess.exitCode,
          signalCode: state.vmmProcess.signalCode,
        },
      );
      return {
        success: false,
        error: { reason: "container-already-started" },
      };
    }

    try {
      // bootVm triggers the REST API call (cloud-hypervisor) or is a no-op (vfkit, which boots
      // automatically on spawn). Either way this is the right moment to attach log forwarding.
      await this.adapter.bootVm(state.apiSocketPath);
    } catch (error) {
      this.logger.error("Failed to boot VM sandbox", {
        sandboxId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: { reason: "boot-failed" } };
    }

    // Forward VMM stdout/stderr to the logger as structured lines. The VMM process uses
    // stdio: "pipe" so the streams are present. Mirrors how DockerLoggingService streams logs.
    const forwardOutput = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      const output = chunk.toString("utf8").trim();
      if (output) {
        this.logger.info("VM sandbox emitted output", {
          sandboxId: id,
          stream,
          output,
        });
      }
    };
    state.vmmProcess.stdout?.on("data", forwardOutput("stdout"));
    state.vmmProcess.stderr?.on("data", forwardOutput("stderr"));

    this.logger.info("Started VM sandbox", {
      sandboxId: id,
      platform: this.adapter.platform,
    });

    return { success: true, value: "started" };
  }

  async waitForSandboxToFinish(
    id: SandboxId,
  ): Promise<
    Result<WaitForSandboxToFinishSuccess, WaitForSandboxToFinishFailure>
  > {
    const state = this.knownSandboxes.get(id);
    if (state === undefined) {
      this.logger.warn("Could not wait for VM sandbox, sandbox not found", {
        sandboxId: id,
      });
      return { success: false, error: { reason: "container-not-found" } };
    }

    // If the process already exited before we started waiting, treat it as not-running.
    // This mirrors Docker's behaviour of returning container-not-running when the container
    // is in "exited" state before wait() is called.
    if (hasProcessExited(state.vmmProcess)) {
      this.releaseSandboxResources(id, state);
      this.knownSandboxes.delete(id);
      this.logger.warn("VM sandbox already exited before wait started", {
        sandboxId: id,
        exitCode: state.vmmProcess.exitCode,
        signalCode: state.vmmProcess.signalCode,
      });
      return { success: false, error: { reason: "container-not-running" } };
    }

    const vmmExitCode = await new Promise<number>((resolve) => {
      state.vmmProcess.once("exit", (code) => resolve(code ?? -1));
    });

    // The VMM exit code only reports that the hypervisor stopped, not how the agent finished —
    // vm-mount-setup.sh powers the VM off cleanly regardless of the lifecycle result. The real
    // exit code is what the guest wrote to the shared dir; its absence means the run did not finish
    // normally (crash, kill, or panic), which we treat as an error. Read it before releasing the
    // sandbox resources, which deletes the exit-code file along with everything else.
    const guestExitCode = readGuestExitCode(state.sharedDir);

    // This is the happy-path end of a run: the orchestrator only calls stopSandbox when a wait
    // did NOT complete, so the per-run resources (rootfs clone, virtiofsd, socket and log files)
    // must be reclaimed here or every successful run leaks them. Mirrors Docker's
    // waitForSandboxToFinish removing the container once it has exited.
    this.releaseSandboxResources(id, state);
    this.knownSandboxes.delete(id);
    // "timeout" is part of the shared success union but the VM path never produces it — the caller
    // enforces the timeout. Typing the result lets the narrower ternary assign without a cast.
    const exitResult: WaitForSandboxToFinishSuccess = {
      exitCode: guestExitCode ?? vmmExitCode,
      reason: guestExitCode === 0 ? "completed" : "error",
    };

    this.logger.info("VM sandbox finished", {
      sandboxId: id,
      exitCode: exitResult.exitCode,
      reason: exitResult.reason,
      // Surfaces when the guest never recorded a result (vs. a non-zero agent exit).
      guestExitCodeRecorded: guestExitCode !== undefined,
    });

    return { success: true, value: exitResult };
  }

  async stopSandbox(id: SandboxId): Promise<void> {
    const state = this.knownSandboxes.get(id);
    if (state === undefined) {
      return;
    }

    // Step 1: graceful shutdown via the VMM REST API.
    try {
      await this.adapter.shutdownVm(state.apiSocketPath);
    } catch (error) {
      this.logger.warn("Graceful VM shutdown request failed", {
        sandboxId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 2: wait up to 30 s for the VMM process to exit on its own.
    await new Promise<void>((resolve) => {
      if (hasProcessExited(state.vmmProcess)) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        state.vmmProcess.removeListener("exit", onExit);
        resolve();
      }, 30_000);
      const onExit = () => {
        clearTimeout(timer);
        resolve();
      };
      state.vmmProcess.once("exit", onExit);
    });

    // Step 3: force-kill if still running after the grace period.
    if (!hasProcessExited(state.vmmProcess)) {
      try {
        state.vmmProcess.kill("SIGKILL");
      } catch (error) {
        this.logger.warn("Failed to SIGKILL VMM process", {
          sandboxId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Step 4: release the per-run resources (virtiofsd, sockets, console log, rootfs clone,
    // shared-dir files) and remove the sandbox from the tracking map.
    this.releaseSandboxResources(id, state);
    this.knownSandboxes.delete(id);

    this.logger.info("Stopped VM sandbox", { sandboxId: id });
  }

  /**
   * Reclaims everything a run accumulated on the host: the virtiofsd process (Linux only), the
   * VMM API/virtiofsd sockets, the console log, the per-run rootfs clone, and the files written
   * into the shared dir. Called from BOTH end-of-life paths — waitForSandboxToFinish when the VM
   * exits on its own (the orchestrator does not call stopSandbox after a completed wait), and
   * stopSandbox for aborted runs — so neither path leaks.
   *
   * The rootfs clone matters most: even CoW-backed it grows as the guest writes, and on
   * filesystems without reflink support it is a full copy of the base image per run.
   *
   * Takes the state without the VMM process so createNewSandbox can also use it to tear down a
   * sandbox that failed before its VMM ever spawned.
   */
  private releaseSandboxResources(
    id: SandboxId,
    state: Omit<VmSandboxState, "vmmProcess">,
  ): void {
    // Kill virtiofsd (Linux only; null on macOS where vfkit serves virtio-fs itself).
    if (state.virtiofsdProcess !== null) {
      try {
        state.virtiofsdProcess.kill("SIGTERM");
      } catch (error) {
        this.logger.warn("Failed to stop virtiofsd process", {
          sandboxId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Clean up socket files, the console log, and the per-run rootfs clone.
    // Ignore errors — these may not exist if the VMM failed to start.
    for (const tempPath of [
      state.apiSocketPath,
      state.virtiofsdSocketPath,
      state.consoleLogPath,
      state.runRootfsPath,
    ]) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // file may not exist if the process never got that far
      }
    }
    // Remove the per-run files we wrote into the shared dir (the setup script, our copy of
    // lifecycle.sh, and the guest exit-code file). The run temp dir itself is owned by
    // WorkflowExecutionService, so we leave it.
    for (const fileName of [
      "vm-mount-setup.sh",
      "lifecycle.sh",
      EXIT_CODE_FILENAME,
    ]) {
      try {
        fs.unlinkSync(path.join(state.sharedDir, fileName));
      } catch {
        // file may not exist if createNewSandbox failed partway through
      }
    }
  }

  async stopAllSandboxes(): Promise<void> {
    const sandboxIds = [...this.knownSandboxes.keys()];
    if (sandboxIds.length === 0) {
      return;
    }

    this.logger.info("Stopping active VM sandboxes", {
      count: sandboxIds.length,
    });
    await Promise.all(sandboxIds.map((id) => this.stopSandbox(id)));
    this.logger.info("Stopped all VM sandboxes");
  }
}
