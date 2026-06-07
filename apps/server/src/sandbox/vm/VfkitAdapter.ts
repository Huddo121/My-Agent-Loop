import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unixSocketRequest } from "./unixSocketHttp";
import type {
  VmInfo,
  VmNetworkConfig,
  VmPlatformAdapter,
} from "./VmPlatformAdapter";

// Typed response shape for the vfkit state endpoint.
interface VfkitStateResponse {
  state: string;
  [key: string]: unknown;
}

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
 */
export function buildVfkitArgs(options: {
  apiSocketPath: string;
  kernelPath: string;
  rootfsPath: string;
  virtiofsTag: string;
  memorySizeMb: number;
  cpuCount: number;
  sharedDir?: string;
}): string[] {
  // vfkit requires the actual shared directory for virtio-fs, not a socket path.
  // If sharedDir is not provided here the caller made a mistake in configuring the adapter.
  if (options.sharedDir === undefined) {
    throw new Error(
      "VfkitAdapter.startVmm: sharedDir is required — vfkit uses the directory directly for virtio-fs",
    );
  }

  return [
    "--kernel",
    options.kernelPath,
    "--disk",
    `path=${options.rootfsPath}`,
    "--device",
    `virtio-fs,sharedDir=${options.sharedDir},mountTag=${options.virtiofsTag}`,
    "--memory",
    String(options.memorySizeMb),
    "--cpus",
    String(options.cpuCount),
    "--restful-uri",
    `unix://${options.apiSocketPath}`,
  ];
}
