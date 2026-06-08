import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AbsoluteFilePath } from "../../file-system/FilePath";
import {
  findCommonParentDir,
  generateVmMountSetupScript,
  readGuestExitCode,
  shellQuote,
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
        "set -e",
        "# /mnt/host is already mounted by vm-init.sh",
        "",
        "# Map volumes",
        "ln -s /mnt/host/code /code",
        "ln -s /mnt/host/task.txt /task.txt",
        "mkdir -p /root/.config/opencode",
        "cp /mnt/host/harness/harness-0-opencode.json /root/.config/opencode/opencode.json",
        "ln -s /mnt/host/harness-setup.sh /harness-setup.sh",
        "",
        "# Export environment",
        `export AGENT_RUN_COMMAND='opencode run "..."'`,
        "",
        "# Run the lifecycle script, capturing its exit code for the host to read.",
        "# Disable errexit first so a failing run still records its code and powers off.",
        "set +e",
        "/mnt/host/lifecycle.sh",
        "LIFECYCLE_EXIT_CODE=$?",
        'echo "$LIFECYCLE_EXIT_CODE" > /mnt/host/.vm-exit-code',
        "sync",
        "",
        "# Power off so the VMM process exits (PID 1 must not just return — that panics the kernel).",
        "echo o > /proc/sysrq-trigger 2>/dev/null || halt -f 2>/dev/null || poweroff -f 2>/dev/null || true",
        "",
      ].join("\n"),
    );
  });

  it("starts with #!/bin/sh and set -e", () => {
    const script = generateVmMountSetupScript(
      [],
      {},
      sharedDir,
      "lifecycle.sh",
    );
    const lines = script.split("\n");
    expect(lines[0]).toBe("#!/bin/sh");
    expect(lines[1]).toBe("set -e");
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
    expect(script).toContain("ln -s /mnt/host/code /code");
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
    expect(script).toContain("ln -s /mnt/host/task.txt /task.txt");
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
    expect(script).toContain("mkdir -p /root/.config/opencode");
    expect(script).toContain(
      "cp /mnt/host/harness/harness-0-opencode.json /root/.config/opencode/opencode.json",
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

  it("produces no export lines when env is undefined", () => {
    const script = generateVmMountSetupScript(
      [],
      undefined,
      sharedDir,
      "lifecycle.sh",
    );
    expect(script).not.toContain("export ");
  });

  it("produces no export lines when env is empty", () => {
    const script = generateVmMountSetupScript(
      [],
      {},
      sharedDir,
      "lifecycle.sh",
    );
    expect(script).not.toContain("export ");
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
      "ln -s /mnt/host/harness/config.json /config.json",
    );
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
