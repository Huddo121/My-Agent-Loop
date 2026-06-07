import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unixSocketRequest } from "./unixSocketHttp";
import type {
  VmInfo,
  VmNetworkConfig,
  VmPlatformAdapter,
} from "./VmPlatformAdapter";

// Typed response shape for the cloud-hypervisor GET /api/v1/vm.info endpoint.
interface CloudHypervisorVmInfoResponse {
  state: string;
  [key: string]: unknown;
}

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

  async startVmm(options: {
    apiSocketPath: string;
    kernelPath: string;
    rootfsPath: string;
    virtiofsSocketPath: string;
    virtiofsTag: string;
    memorySizeMb: number;
    cpuCount: number;
    networkConfig: VmNetworkConfig;
    sharedDir?: string;
  }): Promise<ChildProcess> {
    if (this.cloudHypervisorPath === undefined) {
      throw new Error("CLOUD_HYPERVISOR_PATH is not configured");
    }

    const args = buildCloudHypervisorArgs(options);
    return spawn(this.cloudHypervisorPath, args, { stdio: "pipe" });
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
 */
export function buildCloudHypervisorArgs(options: {
  apiSocketPath: string;
  kernelPath: string;
  rootfsPath: string;
  virtiofsSocketPath: string;
  virtiofsTag: string;
  memorySizeMb: number;
  cpuCount: number;
  networkConfig: VmNetworkConfig;
}): string[] {
  const args = [
    "--api-socket",
    options.apiSocketPath,
    "--kernel",
    options.kernelPath,
    "--disk",
    `path=${options.rootfsPath}`,
    "--fs",
    `tag=${options.virtiofsTag},socket=${options.virtiofsSocketPath}`,
    "--memory",
    // shared=on is required for virtio-fs DAX (direct access) mode
    `size=${options.memorySizeMb}M,shared=on`,
    "--cpus",
    `boot=${options.cpuCount}`,
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
