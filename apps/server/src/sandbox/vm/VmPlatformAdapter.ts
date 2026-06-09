import type { ChildProcess } from "node:child_process";

// Cloud Hypervisor reports VM state as these string values via its REST API.
// We keep state as a plain string union so unknown future states don't break the type.
export type VmState =
  | "Created"
  | "Running"
  | "Shutdown"
  | "Paused"
  | "BreakPoint"
  | (string & {});

export interface VmInfo {
  state: VmState;
}

// Linux (cloud-hypervisor) needs a TAP device and MAC address to wire the VM into the host bridge,
// so these fields apply on Linux only. macOS (vfkit) uses Virtualization.framework NAT instead: the
// adapter always attaches a `virtio-net,nat` NIC and the guest DHCPs an address (see VfkitAdapter
// and the initramfs network bring-up), so it ignores these fields — but note that NAT still requires
// that NIC and guest-side DHCP; it is not "no network config". We keep one shared type so startVmm
// accepts a unified networkConfig regardless of platform.
export interface VmNetworkConfig {
  tapDevice?: string;
  mac?: string;
}

export interface StartVmmOptions {
  apiSocketPath: string;
  kernelPath: string;
  rootfsPath: string;
  // Path to the initramfs. vfkit's Linux bootloader requires it (and Virtualization.framework does
  // not mount the root disk itself); cloud-hypervisor uses it via --initramfs. The caller always
  // supplies it, so it is required here — vfkit can then rely on it without a runtime guard.
  initrdPath: string;
  virtiofsSocketPath: string;
  virtiofsTag: string;
  memorySizeMb: number;
  cpuCount: number;
  networkConfig: VmNetworkConfig;
  // vfkit needs the actual host directory rather than a virtiofsd socket because it handles
  // virtio-fs natively via Virtualization.framework. cloud-hypervisor ignores this field and
  // uses virtiofsSocketPath instead. Required because vfkit cannot start without it.
  sharedDir: string;
  // File the guest serial console is written to. vfkit needs a file path here because its stdio
  // console requires a TTY, which is unavailable when the VMM is spawned headless.
  consoleLogPath: string;
}

export interface VmPlatformAdapter {
  readonly platform: "linux" | "macos";

  isAvailable(): Promise<boolean>;

  // Returns null on platforms where the VMM handles virtio-fs natively (macOS/vfkit),
  // so there is no separate virtiofsd process to track or tear down.
  startVirtiofsd(options: {
    socketPath: string;
    sharedDir: string;
  }): Promise<ChildProcess | null>;

  startVmm(options: StartVmmOptions): Promise<ChildProcess>;

  bootVm(apiSocketPath: string): Promise<void>;
  shutdownVm(apiSocketPath: string): Promise<void>;
  getVmInfo(apiSocketPath: string): Promise<VmInfo>;
}
