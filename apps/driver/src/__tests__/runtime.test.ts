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

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {};
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

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

  it("does not block stream consumption on earlier log sends", async () => {
    const firstLogSend = createDeferred<void>();
    const secondLogSend = createDeferred<void>();

    sendLogMock
      .mockReturnValueOnce(firstLogSend.promise)
      .mockReturnValueOnce(secondLogSend.promise);
    executeHarnessCommandMock.mockImplementation(
      async (
        _options: { command: string; cwd: string },
        onStreams: (streams: {
          stdout: NodeJS.ReadableStream;
          stderr: NodeJS.ReadableStream;
        }) => void,
      ) => {
        onStreams({
          stdout: Readable.from(["first\n", "second\n"]),
          stderr: Readable.from([]),
        });

        return { exitCode: 0, signal: null };
      },
    );

    const runDriverPromise = runDriver(invocation);
    await vi.waitFor(() => expect(sendLogMock).toHaveBeenCalledTimes(2));
    expect(sendLifecycleEventMock).toHaveBeenCalledTimes(1);

    secondLogSend.resolve(undefined);
    await Promise.resolve();
    expect(sendLifecycleEventMock).toHaveBeenCalledTimes(1);

    firstLogSend.resolve(undefined);
    await vi.waitFor(() =>
      expect(sendLifecycleEventMock).toHaveBeenCalledTimes(2),
    );

    await expect(runDriverPromise).resolves.toBeUndefined();
  });
});
