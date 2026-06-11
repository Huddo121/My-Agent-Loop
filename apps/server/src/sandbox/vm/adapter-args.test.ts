import { describe, expect, it } from "vitest";
import {
  buildCloudHypervisorArgs,
  buildNetArg,
  buildVirtiofsdArgs,
  CloudHypervisorAdapter,
} from "./CloudHypervisorAdapter";
import { buildVfkitArgs } from "./VfkitAdapter";

// These builders encode the exact CLI contract with each VMM binary. The binaries can't run in
// this environment, so these tests pin the flag construction that we otherwise couldn't verify.

describe("buildVirtiofsdArgs", () => {
  it("builds socket, shared-dir and cache flags", () => {
    expect(buildVirtiofsdArgs("/tmp/vfsd.sock", "/run/share")).toEqual([
      "--socket-path=/tmp/vfsd.sock",
      "--shared-dir=/run/share",
      "--cache=never",
    ]);
  });
});

describe("buildNetArg", () => {
  it("returns undefined when no network fields are set", () => {
    expect(buildNetArg({})).toBeUndefined();
  });

  it("includes only the tap device when only it is set", () => {
    expect(buildNetArg({ tapDevice: "tap0" })).toBe("tap=tap0");
  });

  it("includes only the mac when only it is set", () => {
    expect(buildNetArg({ mac: "12:34:56:78:9a:bc" })).toBe(
      "mac=12:34:56:78:9a:bc",
    );
  });

  it("joins tap and mac with a comma", () => {
    expect(buildNetArg({ tapDevice: "tap0", mac: "12:34:56:78:9a:bc" })).toBe(
      "tap=tap0,mac=12:34:56:78:9a:bc",
    );
  });
});

describe("buildCloudHypervisorArgs", () => {
  const base = {
    apiSocketPath: "/tmp/ch.sock",
    kernelPath: "/vm/vmlinux",
    rootfsPath: "/vm/rootfs.raw",
    initrdPath: "/vm/initramfs.cpio.gz",
    virtiofsSocketPath: "/tmp/vfsd.sock",
    virtiofsTag: "hostshare",
    memorySizeMb: 2048,
    cpuCount: 2,
    networkConfig: {},
    sharedDir: "/run/share",
    consoleLogPath: "/tmp/vm-console.log",
  };

  it("builds the core boot args with initramfs, serial console and shared memory", () => {
    const args = buildCloudHypervisorArgs(base);
    expect(args).toEqual([
      "--api-socket",
      "/tmp/ch.sock",
      "--kernel",
      "/vm/vmlinux",
      "--cmdline",
      "console=ttyS0",
      "--disk",
      "path=/vm/rootfs.raw",
      "--fs",
      "tag=hostshare,socket=/tmp/vfsd.sock",
      "--memory",
      "size=2048M,shared=on",
      "--cpus",
      "boot=2",
      "--initramfs",
      "/vm/initramfs.cpio.gz",
      "--serial",
      "file=/tmp/vm-console.log",
    ]);
  });

  it("appends a --net arg when network config is provided", () => {
    const args = buildCloudHypervisorArgs({
      ...base,
      networkConfig: { tapDevice: "tap0", mac: "12:34:56:78:9a:bc" },
    });
    const netFlagIndex = args.indexOf("--net");
    expect(netFlagIndex).toBeGreaterThan(-1);
    expect(args[netFlagIndex + 1]).toBe("tap=tap0,mac=12:34:56:78:9a:bc");
  });

  it("omits --net when network config is empty", () => {
    expect(buildCloudHypervisorArgs(base)).not.toContain("--net");
  });

  it("startVmm refuses to boot a VM without a TAP device", async () => {
    // A NIC-less VM cannot reach the host driver API, so the run would only fail at the workflow
    // timeout. The adapter must fail fast — before spawning anything — naming the missing config.
    const adapter = new CloudHypervisorAdapter(
      "/usr/local/bin/cloud-hypervisor",
      "/usr/local/bin/virtiofsd",
    );
    await expect(adapter.startVmm(base)).rejects.toThrow("VM_TAP_DEVICE");
  });
});

describe("buildVfkitArgs", () => {
  // A complete, valid set of options matching the recipe validated by `pnpm vm:smoke-test`.
  const base = {
    apiSocketPath: "/tmp/vfkit.sock",
    kernelPath: "/vm/Image-arm64",
    rootfsPath: "/vm/rootfs.raw",
    initrdPath: "/vm/initramfs.cpio.gz",
    virtiofsSocketPath: "/tmp/vfsd.sock",
    virtiofsTag: "hostshare",
    memorySizeMb: 2048,
    cpuCount: 2,
    networkConfig: {},
    sharedDir: "/run/share",
    consoleLogPath: "/tmp/vm-console.log",
  };

  it("builds the bootloader, virtio-blk/fs/net/serial devices and REST socket", () => {
    expect(buildVfkitArgs(base)).toEqual([
      "--cpus",
      "2",
      "--memory",
      "2048",
      "--bootloader",
      'linux,kernel=/vm/Image-arm64,initrd=/vm/initramfs.cpio.gz,cmdline="console=hvc0"',
      "--device",
      "virtio-blk,path=/vm/rootfs.raw",
      "--device",
      "virtio-fs,sharedDir=/run/share,mountTag=hostshare",
      "--device",
      "virtio-net,nat",
      "--device",
      "virtio-serial,logFilePath=/tmp/vm-console.log",
      "--restful-uri",
      "unix:///tmp/vfkit.sock",
    ]);
  });
});
