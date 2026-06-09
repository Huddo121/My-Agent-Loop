import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { promisify } from "node:util";
import { unixSocketRequest } from "./unixSocketHttp";

const execFileAsync = promisify(execFile);
import type {
  StartVmmOptions,
  VmInfo,
  VmPlatformAdapter,
} from "./VmPlatformAdapter";

// Only `state` is relied on; the rest of vfkit's state response is intentionally left opaque so
// changes to fields we don't use don't ripple into this type.
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

  // `cp -c` requests an APFS clonefile: a copy-on-write clone that is near-instant and shares blocks
  // until one side is written. Node's copyFileSync(COPYFILE_FICLONE) does NOT use clonefile on macOS
  // (it silently full-copies), so we shell out. Fall back to a plain copy if the volume can't clone.
  async cloneRootfs(baseRootfsPath: string, destPath: string): Promise<void> {
    try {
      await execFileAsync("cp", ["-c", baseRootfsPath, destPath]);
    } catch {
      copyFileSync(baseRootfsPath, destPath);
    }
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
  return [
    "--cpus",
    String(options.cpuCount),
    "--memory",
    String(options.memorySizeMb),
    // Linux bootloader: kernel + initramfs + cmdline. The cmdline value is wrapped in literal
    // double quotes (vfkit strips them); required so values containing spaces parse correctly.
    "--bootloader",
    `linux,kernel=${options.kernelPath},initrd=${options.initrdPath},cmdline="${VFKIT_KERNEL_CMDLINE}"`,
    // The initramfs expects the root disk as the first virtio-blk device (/dev/vda) and switch_roots
    // into it, so this entry must stay ahead of the other --device entries.
    "--device",
    `virtio-blk,path=${options.rootfsPath}`,
    "--device",
    `virtio-fs,sharedDir=${options.sharedDir},mountTag=${options.virtiofsTag}`,
    // NAT networking via Virtualization.framework's built-in vmnet. Without a NIC the guest has no
    // route at all and the in-VM driver fails with ENETUNREACH when calling back to the host. NAT
    // needs no host-side setup; the guest reaches the host at the vmnet gateway (VM_HOST_BRIDGE_IP)
    // after it DHCPs an address — see the initramfs network bring-up in scripts/build-vm-rootfs.sh.
    "--device",
    "virtio-net,nat",
    // Guest serial console written to a file (stdio console needs a TTY, unavailable when headless).
    "--device",
    `virtio-serial,logFilePath=${options.consoleLogPath}`,
    "--restful-uri",
    `unix://${options.apiSocketPath}`,
  ];
}
