import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostApiClient } from "./host-api";

describe("HostApiClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends logs through the shared driver contract", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }, 200));

    const client = new HostApiClient({
      baseUrl: "http://localhost:3000",
      runId: "run-123",
      driverToken: "secret-token",
    });

    await client.sendLog({
      message: "test log message",
      stream: "stdout",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe(
      "http://localhost:3000/api/internal/driver/runs/run-123/logs",
    );
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-MAL-Driver-Token": "secret-token",
    });
    expect(JSON.parse(options.body as string)).toEqual({
      message: "test log message",
      stream: "stdout",
    });
  });

  it("sends lifecycle events through the shared driver contract", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }, 200));

    const client = new HostApiClient({
      baseUrl: "http://localhost:3000",
      runId: "run-123",
      driverToken: "secret-token",
    });

    await client.sendLifecycleEvent({
      kind: "harness-starting",
      harnessCommand: "echo hello world",
    });

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe(
      "http://localhost:3000/api/internal/driver/runs/run-123/lifecycle",
    );
    expect(options.headers).toMatchObject({
      "X-MAL-Driver-Token": "secret-token",
    });
    expect(JSON.parse(options.body as string)).toEqual({
      kind: "harness-starting",
      harnessCommand: "echo hello world",
    });
  });

  it("logs application errors returned by the host", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    fetchMock.mockResolvedValue(
      jsonResponse({ code: "unauthenticated", result: "error" }, 401),
    );

    const client = new HostApiClient({
      baseUrl: "http://localhost:3000",
      runId: "run-123",
      driverToken: "secret-token",
    });

    await client.sendLog({ message: "test", stream: "stdout" });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to send log to host: 401 unauthenticated",
    );
    consoleErrorSpy.mockRestore();
  });

  it("does not throw when transport fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const transportError = new Error("network down");
    fetchMock.mockRejectedValue(transportError);

    const client = new HostApiClient({
      baseUrl: "http://localhost:3000",
      runId: "run-123",
      driverToken: "secret-token",
    });

    await expect(
      client.sendLifecycleEvent({
        kind: "harness-starting",
        harnessCommand: "echo hello",
      }),
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to send lifecycle event to host due to transport error:",
      transportError,
    );
    consoleErrorSpy.mockRestore();
  });
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
