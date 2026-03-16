import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DriverInvocation } from "../cli";

const { executeHarnessCommandMock, sendLogMock, sendLifecycleEventMock } =
  vi.hoisted(() => ({
    executeHarnessCommandMock: vi.fn(),
    sendLogMock: vi.fn(),
    sendLifecycleEventMock: vi.fn(),
  }));

vi.mock("../harness-process", () => ({
  executeHarnessCommand: executeHarnessCommandMock,
}));

vi.mock("../host-api", () => ({
  HostApiClient: class {
    sendLog = sendLogMock;
    sendLifecycleEvent = sendLifecycleEventMock;
  },
}));

import { runDriver } from "../runtime";

const invocation: DriverInvocation = {
  runId: "run-123" as never,
  taskId: "task-456" as never,
  hostApiBaseUrl: "http://localhost:3000",
  driverToken: "driver-token",
  harnessCommand: "echo hello",
};

describe("runDriver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it("preserves the harness exit code when host reporting fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    sendLifecycleEventMock
      .mockRejectedValueOnce(new Error("starting failed"))
      .mockRejectedValueOnce(new Error("exit failed"));
    sendLogMock.mockRejectedValueOnce(new Error("log failed"));
    executeHarnessCommandMock.mockImplementation(
      async (
        _options: { command: string; cwd: string },
        onStreams: (streams: {
          stdout: NodeJS.ReadableStream;
          stderr: NodeJS.ReadableStream;
        }) => void,
      ) => {
        onStreams({
          stdout: Readable.from(["hello from stdout\n"]),
          stderr: Readable.from([]),
        });

        return { exitCode: 17, signal: null };
      },
    );

    await expect(runDriver(invocation)).resolves.toBeUndefined();

    expect(sendLifecycleEventMock).toHaveBeenCalledTimes(2);
    expect(sendLogMock).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(17);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(3);

    consoleErrorSpy.mockRestore();
  });
});
