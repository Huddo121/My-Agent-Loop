import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { promisify } from "node:util";
import { unixSocketRequest } from "./unixSocketHttp";

const execFileAsync = promisify(execFile);
import type {
  StartVmmOptions,
  VmInfo,
  VmNetworkConfig,
  VmPlatformAdapter,
} from "./VmPlatformAdapter";

// Only `state` is relied on; the rest of the cloud-hypervisor vm.info response is intentionally left
// opaque so changes to fields we don't use don't ripple into this type.
interface CloudHypervisorVmInfoResponse {
  state: string;
  [key: string]: unknown;
}

// The shared initramfs mounts /dev/vda and switch_roots into /sbin/vm-init, so the cmdline only
// needs to point the console at the serial port. cloud-hypervisor's serial shows up as ttyS0.
const CLOUD_HYPERVISOR_KERNEL_CMDLINE = "console=ttyS0";

export class CloudHypervisorAdapter implements VmPlatformAdapter {
  readonly platform = "linux" as const;

  constructor(
    private readonly cloudHypervisorPath: string | undefined,
    private readonly virtiofsdPath: string | undefined,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      return (
        this.cloudHypervisorPath !== undefined &&
        this.virtiofsdPath !== undefined &&
        existsSync(this.cloudHypervisorPath) &&
        existsSync(this.virtiofsdPath) &&
        existsSync("/dev/kvm")
      );
    } catch {
      return false;
    }
  }

  async startVirtiofsd(options: {
    socketPath: string;
    sharedDir: string;
  }): Promise<ChildProcess> {
    if (this.virtiofsdPath === undefined) {
      throw new Error("VIRTIOFSD_PATH is not configured");
    }

    const args = buildVirtiofsdArgs(options.socketPath, options.sharedDir);
    return spawn(this.virtiofsdPath, args, { stdio: "pipe" });
  }

  async startVmm(options: StartVmmOptions): Promise<ChildProcess> {
    if (this.cloudHypervisorPath === undefined) {
      throw new Error("CLOUD_HYPERVISOR_PATH is not configured");
    }

    const args = buildCloudHypervisorArgs(options);
    return spawn(this.cloudHypervisorPath, args, { stdio: "pipe" });
  }

  // `cp --reflink=auto` makes a copy-on-write clone on filesystems that support reflinks (btrfs, xfs)
  // and transparently falls back to a full copy elsewhere, so the per-run rootfs is cheap where it
  // can be. The extra catch guards against `cp` variants without --reflink.
  async cloneRootfs(baseRootfsPath: string, destPath: string): Promise<void> {
    try {
      await execFileAsync("cp", ["--reflink=auto", baseRootfsPath, destPath]);
    } catch {
      copyFileSync(baseRootfsPath, destPath);
    }
  }

  async bootVm(apiSocketPath: string): Promise<void> {
    await unixSocketRequest(apiSocketPath, "PUT", "/api/v1/vm.boot");
  }

  async shutdownVm(apiSocketPath: string): Promise<void> {
    await unixSocketRequest(apiSocketPath, "PUT", "/api/v1/vm.shutdown");
  }

  async getVmInfo(apiSocketPath: string): Promise<VmInfo> {
    const response = (await unixSocketRequest(
      apiSocketPath,
      "GET",
      "/api/v1/vm.info",
    )) as CloudHypervisorVmInfoResponse;
    return { state: response.state };
  }
}

/**
 * Builds the virtiofsd argument array.
 * Extracted for testability — pure function, no side effects.
 */
export function buildVirtiofsdArgs(
  socketPath: string,
  sharedDir: string,
): string[] {
  return [
    `--socket-path=${socketPath}`,
    `--shared-dir=${sharedDir}`,
    "--cache=never",
  ];
}

/**
 * Builds the cloud-hypervisor argument array.
 * Extracted for testability — pure function, no side effects.
 *
 * NOTE: the Linux/cloud-hypervisor path has not been booted on this project's dev machines (macOS),
 * unlike the vfkit path which `pnpm vm:smoke-test` exercises. The configuration here mirrors the
 * validated vfkit boot model — same initramfs (mount /dev/vda, switch_root into /sbin/vm-init) and a
 * serial console captured to a file — and should be re-verified on a Linux/KVM host.
 */
export function buildCloudHypervisorArgs(options: StartVmmOptions): string[] {
  const args = [
    "--api-socket",
    options.apiSocketPath,
    "--kernel",
    options.kernelPath,
    "--cmdline",
    CLOUD_HYPERVISOR_KERNEL_CMDLINE,
    "--disk",
    `path=${options.rootfsPath}`,
    "--fs",
    `tag=${options.virtiofsTag},socket=${options.virtiofsSocketPath}`,
    "--memory",
    // shared=on is required for virtio-fs DAX (direct access) mode
    `size=${options.memorySizeMb}M,shared=on`,
    "--cpus",
    `boot=${options.cpuCount}`,
    // The same busybox initramfs the vfkit path uses; required to mount the rootfs disk and switch
    // into /sbin/vm-init before the agent runs.
    "--initramfs",
    options.initrdPath,
    // Capture the guest serial console to a file so runs are debuggable, mirroring vfkit's logFilePath.
    "--serial",
    `file=${options.consoleLogPath}`,
  ];

  const netArg = buildNetArg(options.networkConfig);
  if (netArg !== undefined) {
    args.push("--net", netArg);
  }

  return args;
}

/**
 * Converts a VmNetworkConfig into the cloud-hypervisor --net parameter string.
 * Returns undefined when no network fields are provided (VM boots without networking).
 */
export function buildNetArg(config: VmNetworkConfig): string | undefined {
  const parts: string[] = [];
  if (config.tapDevice !== undefined) parts.push(`tap=${config.tapDevice}`);
  if (config.mac !== undefined) parts.push(`mac=${config.mac}`);
  return parts.length > 0 ? parts.join(",") : undefined;
}
