import { describe, expect, it } from "vitest";
import {
  buildCloudHypervisorArgs,
  buildNetArg,
  buildVirtiofsdArgs,
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
    virtiofsSocketPath: "/tmp/vfsd.sock",
    virtiofsTag: "hostshare",
    memorySizeMb: 2048,
    cpuCount: 2,
  };

  it("builds the core boot args with shared memory enabled for virtio-fs", () => {
    const args = buildCloudHypervisorArgs({ ...base, networkConfig: {} });
    expect(args).toEqual([
      "--api-socket",
      "/tmp/ch.sock",
      "--kernel",
      "/vm/vmlinux",
      "--disk",
      "path=/vm/rootfs.raw",
      "--fs",
      "tag=hostshare,socket=/tmp/vfsd.sock",
      "--memory",
      "size=2048M,shared=on",
      "--cpus",
      "boot=2",
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
    const args = buildCloudHypervisorArgs({ ...base, networkConfig: {} });
    expect(args).not.toContain("--net");
  });
});

describe("buildVfkitArgs", () => {
  const base = {
    apiSocketPath: "/tmp/vfkit.sock",
    kernelPath: "/vm/vmlinux",
    rootfsPath: "/vm/rootfs.raw",
    virtiofsTag: "hostshare",
    memorySizeMb: 2048,
    cpuCount: 2,
  };

  it("passes the shared directory directly to the virtio-fs device", () => {
    const args = buildVfkitArgs({ ...base, sharedDir: "/run/share" });
    expect(args).toEqual([
      "--kernel",
      "/vm/vmlinux",
      "--disk",
      "path=/vm/rootfs.raw",
      "--device",
      "virtio-fs,sharedDir=/run/share,mountTag=hostshare",
      "--memory",
      "2048",
      "--cpus",
      "2",
      "--restful-uri",
      "unix:///tmp/vfkit.sock",
    ]);
  });

  it("throws when sharedDir is missing because vfkit needs the directory, not a socket", () => {
    expect(() => buildVfkitArgs(base)).toThrow(/sharedDir is required/);
  });
});
