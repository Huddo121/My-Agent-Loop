import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unixSocketRequest } from "./unixSocketHttp";
import type {
  StartVmmOptions,
  VmInfo,
  VmPlatformAdapter,
} from "./VmPlatformAdapter";

// Typed response shape for the vfkit state endpoint.
interface VfkitStateResponse {
  state: string;
  [key: string]: unknown;
}

// The initramfs mounts /dev/vda and switch_roots into /sbin/vm-init, so the only kernel cmdline we
// need is the console. hvc0 is the virtio console exposed by the --device virtio-serial below.
const VFKIT_KERNEL_CMDLINE = "console=hvc0";

export class VfkitAdapter implements VmPlatformAdapter {
  readonly platform = "macos" as const;

  constructor(private readonly vfkitPath: string | undefined) {}

  async isAvailable(): Promise<boolean> {
    try {
      return this.vfkitPath !== undefined && existsSync(this.vfkitPath);
    } catch {
      return false;
    }
  }

  // vfkit handles virtio-fs natively via Virtualization.framework — there is no separate virtiofsd
  // process. Returning null (rather than spawning a placeholder) avoids leaking an OS process and
  // matches how VmSandboxService tracks the virtiofsd slot as ChildProcess | null on macOS.
  async startVirtiofsd(_options: {
    socketPath: string;
    sharedDir: string;
  }): Promise<ChildProcess | null> {
    return null;
  }

  async startVmm(options: StartVmmOptions): Promise<ChildProcess> {
    if (this.vfkitPath === undefined) {
      throw new Error("VFKIT_PATH is not configured");
    }

    const args = buildVfkitArgs(options);
    return spawn(this.vfkitPath, args, { stdio: "pipe" });
  }

  // vfkit boots automatically when the process starts, so bootVm is a no-op.
  // There is no separate "boot" REST call in vfkit's API.
  async bootVm(_apiSocketPath: string): Promise<void> {
    return;
  }

  async shutdownVm(apiSocketPath: string): Promise<void> {
    // vfkit exposes a /vm/state endpoint that accepts a PUT with {"state":"Stop"}
    await unixSocketRequest(apiSocketPath, "PUT", "/vm/state", {
      state: "Stop",
    });
  }

  async getVmInfo(apiSocketPath: string): Promise<VmInfo> {
    const response = (await unixSocketRequest(
      apiSocketPath,
      "GET",
      "/vm/state",
    )) as VfkitStateResponse;
    return { state: response.state };
  }
}

/**
 * Builds the vfkit argument array.
 * Extracted for testability — pure function, no side effects.
 *
 * This mirrors the configuration validated by `pnpm vm:smoke-test`. Notable vfkit specifics:
 * - Disks and the virtio-fs share are `--device` entries (there is no `--disk` flag).
 * - The kernel is configured via `--bootloader linux,...`, which requires an initrd.
 * - The guest console must go to a file; `virtio-serial,stdio` fails without a TTY when headless.
 */
export function buildVfkitArgs(options: StartVmmOptions): string[] {
  // vfkit shares the directory directly for virtio-fs (it has no separate virtiofsd socket).
  if (options.sharedDir === undefined) {
    throw new Error(
      "VfkitAdapter.startVmm: sharedDir is required — vfkit shares the directory directly for virtio-fs",
    );
  }
  if (options.initrdPath === undefined) {
    throw new Error(
      "VfkitAdapter.startVmm: initrdPath is required — vfkit's Linux bootloader needs an initramfs",
    );
  }
  if (options.consoleLogPath === undefined) {
    throw new Error(
      "VfkitAdapter.startVmm: consoleLogPath is required — vfkit's stdio console needs a TTY, so guest output must be written to a file",
    );
  }

  return [
    "--cpus",
    String(options.cpuCount),
    "--memory",
    String(options.memorySizeMb),
    // Linux bootloader: kernel + initramfs + cmdline. The cmdline value is wrapped in literal
    // double quotes (vfkit strips them); required so values containing spaces parse correctly.
    "--bootloader",
    `linux,kernel=${options.kernelPath},initrd=${options.initrdPath},cmdline="${VFKIT_KERNEL_CMDLINE}"`,
    // Root disk as virtio-blk; the initramfs mounts it as /dev/vda and switch_roots into it.
    "--device",
    `virtio-blk,path=${options.rootfsPath}`,
    // Host directory shared into the guest; vm-init.sh mounts this tag at /mnt/host.
    "--device",
    `virtio-fs,sharedDir=${options.sharedDir},mountTag=${options.virtiofsTag}`,
    // Guest serial console written to a file (stdio console needs a TTY, unavailable when headless).
    "--device",
    `virtio-serial,logFilePath=${options.consoleLogPath}`,
    // REST API over a Unix socket for lifecycle control (state queries, graceful stop).
    "--restful-uri",
    `unix://${options.apiSocketPath}`,
  ];
}
