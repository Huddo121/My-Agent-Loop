import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { waitForProcessSpawn } from "./processSpawn";

// A bare emitter stands in for a ChildProcess whose spawn outcome the test controls.
class FakeSpawningProcess extends EventEmitter {
  pid: number | undefined;
}

describe("waitForProcessSpawn", () => {
  it("resolves immediately when the process already has a pid", async () => {
    const proc = new FakeSpawningProcess();
    proc.pid = 1234;
    await expect(
      waitForProcessSpawn(proc as unknown as ChildProcess, "vmm"),
    ).resolves.toBe(proc);
  });

  it("resolves when the spawn event fires", async () => {
    const proc = new FakeSpawningProcess();
    const promise = waitForProcessSpawn(proc as unknown as ChildProcess, "vmm");
    proc.emit("spawn");
    await expect(promise).resolves.toBe(proc);
  });

  it("rejects with the process name and cause when the error event fires", async () => {
    const proc = new FakeSpawningProcess();
    const promise = waitForProcessSpawn(
      proc as unknown as ChildProcess,
      "virtiofsd",
    );
    proc.emit("error", new Error("spawn ENOENT"));
    await expect(promise).rejects.toThrow(
      "Failed to spawn virtiofsd: spawn ENOENT",
    );
  });

  // End-to-end against a real spawn: a nonexistent binary path must reject rather than surface
  // as an unhandled "error" event (which would crash the server process).
  it("rejects for a real spawn of a nonexistent binary", async () => {
    const child = spawn("/nonexistent/path/to/vmm-binary", [], {
      stdio: "pipe",
    });
    await expect(waitForProcessSpawn(child, "vmm")).rejects.toThrow(
      "Failed to spawn vmm",
    );
  });
});
