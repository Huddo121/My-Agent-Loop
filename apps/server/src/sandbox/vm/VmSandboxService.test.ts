import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AbsoluteFilePath } from "../../file-system/FilePath";
import type { Logger } from "../../logger/Logger";
import type { VmPlatformAdapter } from "./VmPlatformAdapter";
import {
  findCommonParentDir,
  generateVmMountSetupScript,
  readGuestExitCode,
  shellQuote,
  VmSandboxService,
} from "./VmSandboxService";

// ---------------------------------------------------------------------------
// shellQuote
// ---------------------------------------------------------------------------

describe("shellQuote", () => {
  it("wraps a plain value in single quotes", () => {
    expect(shellQuote("hello world")).toBe("'hello world'");
  });

  it("escapes embedded single quotes using the POSIX technique", () => {
    // The value it's a test contains a single quote; the result must be safe to embed in a
    // POSIX shell export statement.
    expect(shellQuote("it's a test")).toBe(`'it'"'"'s a test'`);
  });

  it("handles empty strings", () => {
    expect(shellQuote("")).toBe("''");
  });
});

// ---------------------------------------------------------------------------
// findCommonParentDir
// ---------------------------------------------------------------------------

describe("findCommonParentDir", () => {
  it("returns undefined for an empty array", () => {
    expect(findCommonParentDir([])).toBeUndefined();
  });

  it("returns the parent directory when all paths share the same parent", () => {
    const paths = [
      "/abs/.devloop/runs/abc123/code/file.ts",
      "/abs/.devloop/runs/abc123/task.txt",
    ];
    expect(findCommonParentDir(paths)).toBe("/abs/.devloop/runs/abc123");
  });

  it("handles paths that are themselves directories (no basename)", () => {
    const paths = [
      "/abs/.devloop/runs/abc123/code",
      "/abs/.devloop/runs/abc123/task.txt",
    ];
    // path.dirname('/abs/.devloop/runs/abc123/code') → '/abs/.devloop/runs/abc123'
    // path.dirname('/abs/.devloop/runs/abc123/task.txt') → '/abs/.devloop/runs/abc123'
    expect(findCommonParentDir(paths)).toBe("/abs/.devloop/runs/abc123");
  });

  it("returns the common ancestor when paths diverge at a lower level", () => {
    const paths = [
      "/abs/.devloop/runs/abc123/harness/harness-0-config.json",
      "/abs/.devloop/runs/abc123/task.txt",
    ];
    expect(findCommonParentDir(paths)).toBe("/abs/.devloop/runs/abc123");
  });

  it("returns undefined when paths share no common segments", () => {
    const paths = ["/a/b/file.txt", "/x/y/file.txt"];
    expect(findCommonParentDir(paths)).toBeUndefined();
  });

  it("handles a single path by returning its parent dir", () => {
    expect(findCommonParentDir(["/abs/.devloop/runs/abc123/task.txt"])).toBe(
      "/abs/.devloop/runs/abc123",
    );
  });
});

// ---------------------------------------------------------------------------
// generateVmMountSetupScript — exact example from plan section 2
// ---------------------------------------------------------------------------

describe("generateVmMountSetupScript", () => {
  const sharedDir = "/abs/.devloop/runs/abc123";

  // The four volumes from the plan's concrete example. lifecycle.sh is NOT a volume — VmSandboxService
  // copies it into the shared dir and the script runs it via /mnt/host/lifecycle.sh.
  const volumes: NonNullable<
    { hostPath: AbsoluteFilePath; containerPath: string; mode?: "ro" | "rw" }[]
  > = [
    {
      hostPath: `${sharedDir}/code` as AbsoluteFilePath,
      containerPath: "/code",
    },
    {
      hostPath: `${sharedDir}/task.txt` as AbsoluteFilePath,
      containerPath: "/task.txt",
    },
    {
      hostPath:
        `${sharedDir}/harness/harness-0-opencode.json` as AbsoluteFilePath,
      containerPath: "/root/.config/opencode/opencode.json",
      mode: "ro",
    },
    {
      hostPath: `${sharedDir}/harness-setup.sh` as AbsoluteFilePath,
      containerPath: "/harness-setup.sh",
    },
  ];

  const env = {
    AGENT_RUN_COMMAND: `opencode run "..."`,
  };

  const lifecycleRelativePath = "lifecycle.sh";

  it("generates the exact script from plan section 2 (standard-root volumes → symlinks, nested file → mkdir+cp)", () => {
    const script = generateVmMountSetupScript(
      volumes,
      env,
      sharedDir,
      lifecycleRelativePath,
    );

    expect(script).toBe(
      [
        "#!/bin/sh",
        "# No `set -e`: this runs as PID 1, so any uncaught error that exits the shell panics the kernel",
        "# and hangs the VMM. We track failures instead and always reach the power-off below.",
        "# /mnt/host is already mounted by vm-init.sh",
        "SETUP_EXIT_CODE=0",
        "",
        "# Map volumes",
        "rm -rf '/code'",
        "ln -s '/mnt/host/code' '/code' || SETUP_EXIT_CODE=1",
        "rm -rf '/task.txt'",
        "ln -s '/mnt/host/task.txt' '/task.txt' || SETUP_EXIT_CODE=1",
        "mkdir -p '/root/.config/opencode'",
        "cp '/mnt/host/harness/harness-0-opencode.json' '/root/.config/opencode/opencode.json' || SETUP_EXIT_CODE=1",
        "rm -rf '/harness-setup.sh'",
        "ln -s '/mnt/host/harness-setup.sh' '/harness-setup.sh' || SETUP_EXIT_CODE=1",
        "",
        "# Export environment",
        `export AGENT_RUN_COMMAND='opencode run "..."'`,
        "",
        "# Match the Docker image runtime environment (HOME, PATH, WORKDIR)",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion syntax, not a JS template literal
        'export HOME="${HOME:-/root}"',
        'export PATH="/root/.local/bin:/root/.opencode/bin:$PATH"',
        "cd /code 2>/dev/null || cd /",
        "",
        "# Run the lifecycle script, capturing its exit code for the host to read.",
        'if [ "$SETUP_EXIT_CODE" -eq 0 ]; then',
        "  '/mnt/host/lifecycle.sh'",
        "  LIFECYCLE_EXIT_CODE=$?",
        "else",
        "  echo 'vm-mount-setup: volume mapping failed; skipping lifecycle' >&2",
        "  LIFECYCLE_EXIT_CODE=$SETUP_EXIT_CODE",
        "fi",
        'echo "$LIFECYCLE_EXIT_CODE" > /mnt/host/.vm-exit-code',
        "sync",
        "",
        "# Power off so the VMM process exits (PID 1 must not just return — that panics the kernel).",
        "echo o > /proc/sysrq-trigger 2>/dev/null || halt -f 2>/dev/null || poweroff -f 2>/dev/null || true",
        "",
      ].join("\n"),
    );
  });

  it("never uses `set -e` so a setup error cannot panic PID 1", () => {
    const script = generateVmMountSetupScript(
      [],
      {},
      sharedDir,
      "lifecycle.sh",
    );
    const lines = script.split("\n");
    expect(lines[0]).toBe("#!/bin/sh");
    // `set -e` would let any failed command exit the shell; as PID 1 that panics the kernel and
    // leaks the VMM holding the rootfs image, so it must never appear as a command. (A comment may
    // still mention it, hence the exact-line check rather than a substring search.)
    expect(lines.map((line) => line.trim())).not.toContain("set -e");
    expect(script).toContain("SETUP_EXIT_CODE=0");
  });

  it("runs lifecycle (without exec) and records its exit code before powering off", () => {
    const script = generateVmMountSetupScript(
      [],
      {},
      sharedDir,
      "lifecycle.sh",
    );
    // It must NOT exec lifecycle: as PID 1, exec-then-exit panics the kernel.
    expect(script).not.toContain("exec /mnt/host/lifecycle.sh");
    expect(script).toContain("/mnt/host/lifecycle.sh");
    expect(script).toContain("LIFECYCLE_EXIT_CODE=$?");
    expect(script).toContain(
      'echo "$LIFECYCLE_EXIT_CODE" > /mnt/host/.vm-exit-code',
    );
    expect(script).toContain("/proc/sysrq-trigger");
  });

  it("handles a lifecycle.sh in a subdirectory", () => {
    const script = generateVmMountSetupScript(
      [],
      {},
      sharedDir,
      "sub/lifecycle.sh",
    );
    expect(script).toContain("/mnt/host/sub/lifecycle.sh");
  });

  it("emits symlinks for standard root-level directory volumes", () => {
    const vol = [
      {
        hostPath: `${sharedDir}/code` as AbsoluteFilePath,
        containerPath: "/code",
      },
    ];
    const script = generateVmMountSetupScript(
      vol,
      {},
      sharedDir,
      "lifecycle.sh",
    );
    // The target is removed before the symlink: /code is the image WORKDIR and the rootfs is reused
    // across runs, so `ln -s` into the existing directory would create /code/code and fail next run
    // (which, under PID 1, kernel-panics the guest and leaks the VMM).
    expect(script).toContain(
      "rm -rf '/code'\nln -s '/mnt/host/code' '/code' || SETUP_EXIT_CODE=1",
    );
  });

  it("emits symlinks for standard root-level file volumes", () => {
    const vol = [
      {
        hostPath: `${sharedDir}/task.txt` as AbsoluteFilePath,
        containerPath: "/task.txt",
      },
    ];
    const script = generateVmMountSetupScript(
      vol,
      {},
      sharedDir,
      "lifecycle.sh",
    );
    expect(script).toContain("ln -s '/mnt/host/task.txt' '/task.txt'");
  });

  it("emits mkdir -p and cp for a nested-path file volume", () => {
    const vol = [
      {
        hostPath:
          `${sharedDir}/harness/harness-0-opencode.json` as AbsoluteFilePath,
        containerPath: "/root/.config/opencode/opencode.json",
        mode: "ro" as const,
      },
    ];
    const script = generateVmMountSetupScript(
      vol,
      {},
      sharedDir,
      "lifecycle.sh",
    );
    expect(script).toContain("mkdir -p '/root/.config/opencode'");
    expect(script).toContain(
      "cp '/mnt/host/harness/harness-0-opencode.json' '/root/.config/opencode/opencode.json'",
    );
  });

  it("exports env vars with correct single-quote escaping", () => {
    const envWithQuotes = {
      SIMPLE: "value",
      WITH_QUOTES: "it's quoted",
    };
    const script = generateVmMountSetupScript(
      [],
      envWithQuotes,
      sharedDir,
      "lifecycle.sh",
    );
    expect(script).toContain("export SIMPLE='value'");
    expect(script).toContain(`export WITH_QUOTES='it'"'"'s quoted'`);
  });

  // The script always exports HOME/PATH to mirror the Docker image; these two cases check that an
  // empty/undefined env map adds nothing beyond those framework exports.
  const frameworkExports = [
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion syntax, not a JS template literal
    'export HOME="${HOME:-/root}"',
    'export PATH="/root/.local/bin:/root/.opencode/bin:$PATH"',
  ];

  it("produces no extra export lines when env is undefined", () => {
    const script = generateVmMountSetupScript(
      [],
      undefined,
      sharedDir,
      "lifecycle.sh",
    );
    const exportLines = script
      .split("\n")
      .filter((l) => l.startsWith("export "));
    expect(exportLines).toEqual(frameworkExports);
  });

  it("produces no extra export lines when env is empty", () => {
    const script = generateVmMountSetupScript(
      [],
      {},
      sharedDir,
      "lifecycle.sh",
    );
    const exportLines = script
      .split("\n")
      .filter((l) => l.startsWith("export "));
    expect(exportLines).toEqual(frameworkExports);
  });

  it("computes relative paths correctly for a file nested one level under the shared dir", () => {
    const vol = [
      {
        hostPath: `${sharedDir}/harness/config.json` as AbsoluteFilePath,
        containerPath: "/config.json",
      },
    ];
    const script = generateVmMountSetupScript(
      vol,
      {},
      sharedDir,
      "lifecycle.sh",
    );
    // containerPath is at root level → symlink; source is /mnt/host/harness/config.json
    expect(script).toContain(
      "ln -s '/mnt/host/harness/config.json' '/config.json'",
    );
  });

  it("quotes path operands so paths containing spaces survive word splitting", () => {
    const spacedSharedDir = "/abs/My Runs/abc 123";
    const vol = [
      {
        hostPath: `${spacedSharedDir}/code` as AbsoluteFilePath,
        containerPath: "/code",
      },
      {
        hostPath:
          `${spacedSharedDir}/harness/with space.json` as AbsoluteFilePath,
        containerPath: "/root/.config/some tool/config.json",
      },
    ];
    const script = generateVmMountSetupScript(
      vol,
      {},
      spacedSharedDir,
      "lifecycle.sh",
    );
    // The shared-dir-relative source and the container target are both single-quoted, so an
    // embedded space cannot split `rm -rf` or `cp` into extra arguments.
    expect(script).toContain("ln -s '/mnt/host/code' '/code'");
    expect(script).toContain("mkdir -p '/root/.config/some tool'");
    expect(script).toContain(
      "cp '/mnt/host/harness/with space.json' '/root/.config/some tool/config.json'",
    );
  });

  it("sets HOME and enters the /code working directory before running lifecycle", () => {
    // The raw-disk boot does not apply the Docker image's HOME/WORKDIR, so the script must, or
    // tools like nvm (→ //.nvm) and pnpm (→ cwd / has no package.json) fail as they did in practice.
    const script = generateVmMountSetupScript(
      [],
      {},
      sharedDir,
      "lifecycle.sh",
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion syntax, not a JS template literal
    const homeIndex = script.indexOf('export HOME="${HOME:-/root}"');
    const cdIndex = script.indexOf("cd /code 2>/dev/null || cd /");
    const lifecycleIndex = script.indexOf("/mnt/host/lifecycle.sh");
    expect(homeIndex).toBeGreaterThan(-1);
    expect(cdIndex).toBeGreaterThan(-1);
    // Both must happen before the lifecycle (and thus the project setup script) runs.
    expect(cdIndex).toBeLessThan(lifecycleIndex);
  });

  it("handles empty volumes and env gracefully", () => {
    // Should not throw, and should produce a minimal valid script
    const script = generateVmMountSetupScript(
      undefined,
      undefined,
      sharedDir,
      "lifecycle.sh",
    );
    expect(script).toContain("#!/bin/sh");
    expect(script).toContain("/mnt/host/lifecycle.sh");
  });
});

describe("readGuestExitCode", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-exit-code-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined when the exit-code file is missing", () => {
    expect(readGuestExitCode(tmpDir)).toBeUndefined();
  });

  it("reads a zero exit code", () => {
    fs.writeFileSync(path.join(tmpDir, ".vm-exit-code"), "0\n");
    expect(readGuestExitCode(tmpDir)).toBe(0);
  });

  it("reads a non-zero exit code", () => {
    fs.writeFileSync(path.join(tmpDir, ".vm-exit-code"), "137\n");
    expect(readGuestExitCode(tmpDir)).toBe(137);
  });

  it("returns undefined for unparseable contents", () => {
    fs.writeFileSync(path.join(tmpDir, ".vm-exit-code"), "not-a-number");
    expect(readGuestExitCode(tmpDir)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// VmSandboxService.createNewSandbox — missing-path guard
// ---------------------------------------------------------------------------

// Minimal in-memory fake that satisfies VmPlatformAdapter. The guard in createNewSandbox fires
// before the adapter is ever called, so the fake methods don't need real implementations.
const noopAdapter: VmPlatformAdapter = {
  platform: "macos",
  isAvailable: async () => false,
  startVirtiofsd: async () => null,
  startVmm: async () => {
    throw new Error("startVmm should not be called when paths are missing");
  },
  cloneRootfs: async () => {
    throw new Error("cloneRootfs should not be called when paths are missing");
  },
  bootVm: async () => {},
  shutdownVm: async () => {},
  getVmInfo: async () => ({ state: "Unknown" }),
};

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const testWorkingDirectory = "/tmp/mal-vm-test-run" as AbsoluteFilePath;

describe("VmSandboxService.createNewSandbox — missing path guard", () => {
  it("rejects when all three paths are undefined", async () => {
    const service = new VmSandboxService(
      noopAdapter,
      undefined,
      undefined,
      undefined,
      noopLogger,
    );
    await expect(
      service.createNewSandbox({
        workingDirectory: testWorkingDirectory,
        volumes: [],
        env: {},
      }),
    ).rejects.toThrow(
      "VM sandbox requires VM_KERNEL_PATH, VM_ROOTFS_PATH and VM_INITRD_PATH to be configured",
    );
  });

  it("rejects when only kernelPath is undefined", async () => {
    const service = new VmSandboxService(
      noopAdapter,
      undefined,
      "/rootfs.raw",
      "/initrd.cpio.gz",
      noopLogger,
    );
    await expect(
      service.createNewSandbox({
        workingDirectory: testWorkingDirectory,
        volumes: [],
        env: {},
      }),
    ).rejects.toThrow("VM_KERNEL_PATH");
  });

  it("rejects when only rootfsPath is undefined", async () => {
    const service = new VmSandboxService(
      noopAdapter,
      "/kernel",
      undefined,
      "/initrd.cpio.gz",
      noopLogger,
    );
    await expect(
      service.createNewSandbox({
        workingDirectory: testWorkingDirectory,
        volumes: [],
        env: {},
      }),
    ).rejects.toThrow("VM_ROOTFS_PATH");
  });

  it("rejects when only initrdPath is undefined", async () => {
    const service = new VmSandboxService(
      noopAdapter,
      "/kernel",
      "/rootfs.raw",
      undefined,
      noopLogger,
    );
    await expect(
      service.createNewSandbox({
        workingDirectory: testWorkingDirectory,
        volumes: [],
        env: {},
      }),
    ).rejects.toThrow("VM_INITRD_PATH");
  });
});

// ---------------------------------------------------------------------------
// VmSandboxService lifecycle — start/wait/stop against an in-memory fake adapter
// ---------------------------------------------------------------------------

// Stands in for the VMM child process. It only models what VmSandboxService touches: the exit code,
// the "exit" event, the stdout/stderr streams it attaches log forwarding to, and kill().
class FakeVmmProcess extends EventEmitter {
  exitCode: number | null = null;
  // Like a real ChildProcess: stays null unless the process died from a signal.
  signalCode: NodeJS.Signals | null = null;
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  killSignal: NodeJS.Signals | number | undefined;

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killSignal = signal;
    return true;
  }

  // Drives the resolution of waitForSandboxToFinish, mirroring the real process emitting "exit".
  simulateExit(code: number): void {
    this.exitCode = code;
    this.emit("exit", code);
  }

  // Mirrors a signal death: Node leaves exitCode null and sets signalCode instead.
  simulateSignalExit(signal: NodeJS.Signals): void {
    this.signalCode = signal;
    this.emit("exit", null, signal);
  }
}

describe("VmSandboxService lifecycle", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  // A service wired to a fake adapter. startVmm hands back a fresh FakeVmmProcess per sandbox, so
  // multiple sandboxes can be tracked independently; bootVm/shutdownVm calls are counted.
  // withVirtiofsd emulates the Linux adapter, which runs a separate virtiofsd process the service
  // must terminate when the sandbox ends.
  function makeService(
    opts: {
      bootShouldThrow?: boolean;
      withVirtiofsd?: boolean;
      startVmmShouldThrow?: boolean;
    } = {},
  ) {
    const vmmProcesses: FakeVmmProcess[] = [];
    const virtiofsdProcesses: FakeVmmProcess[] = [];
    const calls = { boot: 0, shutdown: 0 };
    const adapter: VmPlatformAdapter = {
      platform: "macos",
      isAvailable: async () => true,
      startVirtiofsd: async () => {
        if (!opts.withVirtiofsd) {
          return null;
        }
        const proc = new FakeVmmProcess();
        virtiofsdProcesses.push(proc);
        return proc as unknown as ChildProcess;
      },
      startVmm: async () => {
        if (opts.startVmmShouldThrow) {
          throw new Error("vmm spawn failed");
        }
        const proc = new FakeVmmProcess();
        vmmProcesses.push(proc);
        return proc as unknown as ChildProcess;
      },
      // Real fs copy stands in for the platform CoW clone — enough for the service to track and
      // later delete a distinct per-run file, without depending on a clone-capable filesystem.
      cloneRootfs: async (base: string, dest: string) => {
        fs.copyFileSync(base, dest);
      },
      bootVm: async () => {
        calls.boot++;
        if (opts.bootShouldThrow) {
          throw new Error("boot failed");
        }
      },
      shutdownVm: async () => {
        calls.shutdown++;
      },
      getVmInfo: async () => ({ state: "Running" }),
    };
    // createNewSandbox clones the base rootfs per run (copy-on-write), so the base must be a real
    // file. Put it in its own temp dir; the per-run clones land beside it and are swept in afterEach.
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-base-"));
    tmpDirs.push(baseDir);
    const baseRootfs = path.join(baseDir, "rootfs.raw");
    fs.writeFileSync(baseRootfs, "dummy-rootfs-contents");
    const service = new VmSandboxService(
      adapter,
      "/kernel",
      baseRootfs,
      "/initrd.cpio.gz",
      noopLogger,
    );
    return { service, vmmProcesses, virtiofsdProcesses, calls, baseDir };
  }

  async function addSandbox(service: VmSandboxService) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-svc-"));
    tmpDirs.push(tmpDir);
    // Two volumes whose common parent is tmpDir, so tmpDir becomes the shared dir the service
    // reads the guest exit code back from.
    const sandbox = await service.createNewSandbox({
      workingDirectory: tmpDir as AbsoluteFilePath,
      volumes: [
        {
          hostPath: `${tmpDir}/code` as AbsoluteFilePath,
          containerPath: "/code",
        },
        {
          hostPath: `${tmpDir}/task.txt` as AbsoluteFilePath,
          containerPath: "/task.txt",
        },
      ],
      env: {},
    });
    return { sandbox, tmpDir };
  }

  describe("startSandbox", () => {
    it("returns container-not-found for an unknown sandbox", async () => {
      const { service } = makeService();
      const result = await service.startSandbox("missing" as never);
      expect(result).toEqual({
        success: false,
        error: { reason: "container-not-found" },
      });
    });

    it("returns container-already-started when the VMM has already exited", async () => {
      const { service, vmmProcesses } = makeService();
      const { sandbox } = await addSandbox(service);
      vmmProcesses[0].exitCode = 1;
      const result = await service.startSandbox(sandbox.id);
      expect(result).toEqual({
        success: false,
        error: { reason: "container-already-started" },
      });
    });

    it("boots the VM and returns started on the happy path", async () => {
      const { service, calls } = makeService();
      const { sandbox } = await addSandbox(service);
      const result = await service.startSandbox(sandbox.id);
      expect(result).toEqual({ success: true, value: "started" });
      expect(calls.boot).toBe(1);
    });

    it("returns boot-failed when booting throws", async () => {
      const { service } = makeService({ bootShouldThrow: true });
      const { sandbox } = await addSandbox(service);
      const result = await service.startSandbox(sandbox.id);
      expect(result).toEqual({
        success: false,
        error: { reason: "boot-failed" },
      });
    });
  });

  describe("waitForSandboxToFinish", () => {
    it("returns container-not-found for an unknown sandbox", async () => {
      const { service } = makeService();
      const result = await service.waitForSandboxToFinish("missing" as never);
      expect(result).toEqual({
        success: false,
        error: { reason: "container-not-found" },
      });
    });

    it("returns container-not-running when the VMM exited before waiting", async () => {
      const { service, vmmProcesses } = makeService();
      const { sandbox } = await addSandbox(service);
      vmmProcesses[0].exitCode = 0;
      const result = await service.waitForSandboxToFinish(sandbox.id);
      expect(result).toEqual({
        success: false,
        error: { reason: "container-not-running" },
      });
    });

    it("returns container-not-running when the VMM was signal-killed before waiting", async () => {
      const { service, vmmProcesses } = makeService();
      const { sandbox } = await addSandbox(service);
      // A signal death leaves exitCode null; only signalCode reveals the process is gone.
      vmmProcesses[0].simulateSignalExit("SIGKILL");
      const result = await service.waitForSandboxToFinish(sandbox.id);
      expect(result).toEqual({
        success: false,
        error: { reason: "container-not-running" },
      });
    });

    it("reports completed with the guest exit code when the guest recorded 0", async () => {
      const { service, vmmProcesses } = makeService();
      const { sandbox, tmpDir } = await addSandbox(service);
      fs.writeFileSync(path.join(tmpDir, ".vm-exit-code"), "0\n");
      const waitPromise = service.waitForSandboxToFinish(sandbox.id);
      vmmProcesses[0].simulateExit(0);
      const result = await waitPromise;
      expect(result).toEqual({
        success: true,
        value: { exitCode: 0, reason: "completed" },
      });
    });

    it("reports error with the guest exit code when the guest recorded non-zero", async () => {
      const { service, vmmProcesses } = makeService();
      const { sandbox, tmpDir } = await addSandbox(service);
      fs.writeFileSync(path.join(tmpDir, ".vm-exit-code"), "3\n");
      const waitPromise = service.waitForSandboxToFinish(sandbox.id);
      vmmProcesses[0].simulateExit(0);
      const result = await waitPromise;
      expect(result).toEqual({
        success: true,
        value: { exitCode: 3, reason: "error" },
      });
    });

    it("reports error and falls back to the VMM exit code when the guest recorded nothing", async () => {
      const { service, vmmProcesses } = makeService();
      const { sandbox } = await addSandbox(service);
      // No .vm-exit-code file written → the run did not finish normally (crash/kill/panic).
      const waitPromise = service.waitForSandboxToFinish(sandbox.id);
      vmmProcesses[0].simulateExit(137);
      const result = await waitPromise;
      expect(result).toEqual({
        success: true,
        value: { exitCode: 137, reason: "error" },
      });
    });
  });

  describe("stopSandbox", () => {
    it("is a no-op for an unknown sandbox", async () => {
      const { service } = makeService();
      await expect(
        service.stopSandbox("missing" as never),
      ).resolves.toBeUndefined();
    });

    it("forgets the sandbox when the VMM has already exited", async () => {
      const { service, vmmProcesses, calls } = makeService();
      const { sandbox } = await addSandbox(service);
      // Already exited, so the grace-period wait resolves immediately without a force-kill.
      vmmProcesses[0].exitCode = 0;
      await service.stopSandbox(sandbox.id);
      expect(calls.shutdown).toBe(1);
      expect(vmmProcesses[0].killSignal).toBeUndefined();
      // The sandbox is gone: waiting on it now reports not-found.
      const result = await service.waitForSandboxToFinish(sandbox.id);
      expect(result).toEqual({
        success: false,
        error: { reason: "container-not-found" },
      });
    });

    it("waits for the VMM exit event during graceful shutdown, without force-killing", async () => {
      vi.useFakeTimers();
      try {
        const { service, vmmProcesses, calls } = makeService();
        const { sandbox } = await addSandbox(service);
        // exitCode stays null, so the service must wait on the "exit" event rather than the
        // already-exited fast path.
        const stopPromise = service.stopSandbox(sandbox.id);
        // Flush the graceful-shutdown request so the exit listener is registered, then emit the
        // exit within the grace period (before the 30s force-kill timer fires).
        await vi.advanceTimersByTimeAsync(0);
        vmmProcesses[0].simulateExit(0);
        await stopPromise;
        expect(calls.shutdown).toBe(1);
        // Exited on its own, so no SIGKILL was needed.
        expect(vmmProcesses[0].killSignal).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it("resolves promptly when the VMM was signal-killed, without waiting out the grace period", async () => {
      // Regression: checking exitCode alone misses signal deaths, so stop would attach an exit
      // listener to a process that already exited and eat the full 30s grace period (the test
      // would then fail by exceeding its own timeout).
      const { service, vmmProcesses, calls } = makeService();
      const { sandbox } = await addSandbox(service);
      vmmProcesses[0].simulateSignalExit("SIGKILL");
      await service.stopSandbox(sandbox.id);
      expect(calls.shutdown).toBe(1);
      // Already dead — no further kill attempt.
      expect(vmmProcesses[0].killSignal).toBeUndefined();
    });

    it("force-kills the VMM when it does not exit within the grace period", async () => {
      vi.useFakeTimers();
      try {
        const { service, vmmProcesses, calls } = makeService();
        const { sandbox } = await addSandbox(service);
        // exitCode stays null, so graceful shutdown never completes and the timer fires.
        const stopPromise = service.stopSandbox(sandbox.id);
        await vi.advanceTimersByTimeAsync(30_000);
        await stopPromise;
        expect(calls.shutdown).toBe(1);
        expect(vmmProcesses[0].killSignal).toBe("SIGKILL");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("per-run rootfs isolation", () => {
    // The clone files the service writes next to the base rootfs, so concurrent VMs don't share one
    // exclusively-attachable disk.
    const cloneFiles = (baseDir: string) =>
      fs.readdirSync(baseDir).filter((f) => /^\.vm-rootfs-.*\.raw$/.test(f));

    it("gives each concurrent sandbox its own rootfs clone, distinct from the base", async () => {
      const { service, baseDir } = makeService();
      await addSandbox(service);
      await addSandbox(service);

      const clones = cloneFiles(baseDir);
      // Two sandboxes alive at once → two distinct clones, neither of which is the base image.
      expect(clones).toHaveLength(2);
      expect(new Set(clones).size).toBe(2);
      expect(clones).not.toContain("rootfs.raw");
    });

    it("deletes the rootfs clone when the sandbox is stopped", async () => {
      const { service, vmmProcesses, baseDir } = makeService();
      const { sandbox } = await addSandbox(service);
      expect(cloneFiles(baseDir)).toHaveLength(1);

      vmmProcesses[0].exitCode = 0;
      await service.stopSandbox(sandbox.id);
      // The clone is reclaimed so runs don't accumulate disk images.
      expect(cloneFiles(baseDir)).toHaveLength(0);
      // The base image is untouched.
      expect(fs.existsSync(path.join(baseDir, "rootfs.raw"))).toBe(true);
    });

    // The orchestrator does NOT call stopSandbox after a completed wait, so the wait path itself
    // must reclaim the per-run resources — otherwise every successful run leaks a disk image.
    it("deletes the rootfs clone when the sandbox finishes on its own", async () => {
      const { service, vmmProcesses, baseDir } = makeService();
      const { sandbox, tmpDir } = await addSandbox(service);
      fs.writeFileSync(path.join(tmpDir, ".vm-exit-code"), "0\n");
      expect(cloneFiles(baseDir)).toHaveLength(1);

      const waitPromise = service.waitForSandboxToFinish(sandbox.id);
      vmmProcesses[0].simulateExit(0);
      const result = await waitPromise;

      // The wait still reports the guest's exit code (read before the file is cleaned up)...
      expect(result).toEqual({
        success: true,
        value: { exitCode: 0, reason: "completed" },
      });
      // ...and the per-run clone and shared-dir files are reclaimed.
      expect(cloneFiles(baseDir)).toHaveLength(0);
      expect(fs.existsSync(path.join(tmpDir, ".vm-exit-code"))).toBe(false);
      expect(fs.existsSync(path.join(baseDir, "rootfs.raw"))).toBe(true);
    });

    it("deletes the rootfs clone when the VMM exited before the wait started", async () => {
      const { service, vmmProcesses, baseDir } = makeService();
      const { sandbox } = await addSandbox(service);
      expect(cloneFiles(baseDir)).toHaveLength(1);

      vmmProcesses[0].exitCode = 1;
      const result = await service.waitForSandboxToFinish(sandbox.id);

      expect(result).toEqual({
        success: false,
        error: { reason: "container-not-running" },
      });
      expect(cloneFiles(baseDir)).toHaveLength(0);
    });

    it("releases partial resources when the VMM fails to start", async () => {
      const { service, virtiofsdProcesses, baseDir } = makeService({
        withVirtiofsd: true,
        startVmmShouldThrow: true,
      });
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-svc-"));
      tmpDirs.push(tmpDir);

      await expect(
        service.createNewSandbox({
          workingDirectory: tmpDir as AbsoluteFilePath,
          volumes: [
            {
              hostPath: `${tmpDir}/code` as AbsoluteFilePath,
              containerPath: "/code",
            },
            {
              hostPath: `${tmpDir}/task.txt` as AbsoluteFilePath,
              containerPath: "/task.txt",
            },
          ],
          env: {},
        }),
      ).rejects.toThrow("vmm spawn failed");

      // The sandbox was never registered, so stopSandbox could never reclaim these — creation
      // itself must: the rootfs clone, the started virtiofsd, and the shared-dir files.
      expect(cloneFiles(baseDir)).toHaveLength(0);
      expect(virtiofsdProcesses[0].killSignal).toBe("SIGTERM");
      expect(fs.existsSync(path.join(tmpDir, "vm-mount-setup.sh"))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, "lifecycle.sh"))).toBe(false);
    });

    it("terminates the virtiofsd process when the sandbox finishes on its own", async () => {
      const { service, vmmProcesses, virtiofsdProcesses } = makeService({
        withVirtiofsd: true,
      });
      const { sandbox, tmpDir } = await addSandbox(service);
      fs.writeFileSync(path.join(tmpDir, ".vm-exit-code"), "0\n");

      const waitPromise = service.waitForSandboxToFinish(sandbox.id);
      vmmProcesses[0].simulateExit(0);
      await waitPromise;

      // On Linux the per-run virtiofsd would otherwise outlive the VM as an orphan process.
      expect(virtiofsdProcesses[0].killSignal).toBe("SIGTERM");
    });
  });

  describe("stopAllSandboxes", () => {
    it("does nothing when no sandboxes are active", async () => {
      const { service, calls } = makeService();
      await service.stopAllSandboxes();
      expect(calls.shutdown).toBe(0);
    });

    it("stops every active sandbox", async () => {
      const { service, vmmProcesses, calls } = makeService();
      const first = await addSandbox(service);
      const second = await addSandbox(service);
      // Both already exited so each stop resolves without waiting out the grace period.
      vmmProcesses[0].exitCode = 0;
      vmmProcesses[1].exitCode = 0;
      await service.stopAllSandboxes();
      expect(calls.shutdown).toBe(2);
      for (const { sandbox } of [first, second]) {
        const result = await service.waitForSandboxToFinish(sandbox.id);
        expect(result).toEqual({
          success: false,
          error: { reason: "container-not-found" },
        });
      }
    });
  });
});
