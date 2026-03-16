import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostApiClient } from "../host-api";

describe("HostApiClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("sendLog", () => {
    it("sends log to correct URL with authentication header", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 });

      const client = new HostApiClient({
        baseUrl: "http://localhost:3000",
        runId: "run-123" as never,
        taskId: "task-456" as never,
        driverToken: "secret-token",
      });

      await client.sendLog({
        message: "test log message",
        stream: "stdout",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];

      expect(url.toString()).toBe(
        "http://localhost:3000/internal/driver/runs/run-123/tasks/task-456/logs",
      );
      expect(options.method).toBe("POST");
      expect(options.headers).toMatchObject({
        "X-MAL-Driver-Token": "secret-token",
        "content-type": "application/json",
      });
      expect(JSON.parse(options.body as string)).toEqual({
        message: "test log message",
        stream: "stdout",
      });
    });

    it("sends stderr log correctly", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 });

      const client = new HostApiClient({
        baseUrl: "http://localhost:3000",
        runId: "run-123" as never,
        taskId: "task-456" as never,
        driverToken: "secret-token",
      });

      await client.sendLog({
        message: "error message",
        stream: "stderr",
      });

      const [, options] = fetchMock.mock.calls[0];
      expect(JSON.parse(options.body as string)).toEqual({
        message: "error message",
        stream: "stderr",
      });
    });

    it("logs error when server returns non-OK response", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      const client = new HostApiClient({
        baseUrl: "http://localhost:3000",
        runId: "run-123" as never,
        taskId: "task-456" as never,
        driverToken: "secret-token",
      });

      await client.sendLog({
        message: "test",
        stream: "stdout",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to send log to host: 401 Unauthorized",
      );
      consoleErrorSpy.mockRestore();
    });

    it("constructs correct URL for different base URLs", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 });

      const client = new HostApiClient({
        baseUrl: "https://api.production.example.com",
        runId: "run-456" as never,
        taskId: "task-789" as never,
        driverToken: "another-token",
      });

      await client.sendLog({
        message: "test",
        stream: "stdout",
      });

      const [url] = fetchMock.mock.calls[0];
      expect(url.toString()).toBe(
        "https://api.production.example.com/internal/driver/runs/run-456/tasks/task-789/logs",
      );
    });
  });

  describe("sendLifecycleEvent", () => {
    it("sends harness-starting event correctly", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 });

      const client = new HostApiClient({
        baseUrl: "http://localhost:3000",
        runId: "run-123" as never,
        taskId: "task-456" as never,
        driverToken: "secret-token",
      });

      await client.sendLifecycleEvent({
        kind: "harness-starting",
        harnessCommand: "echo hello world",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];

      expect(url.toString()).toBe(
        "http://localhost:3000/internal/driver/runs/run-123/tasks/task-456/lifecycle",
      );
      expect(options.method).toBe("POST");
      expect(options.headers).toMatchObject({
        "X-MAL-Driver-Token": "secret-token",
        "content-type": "application/json",
      });
      expect(JSON.parse(options.body as string)).toEqual({
        kind: "harness-starting",
        harnessCommand: "echo hello world",
      });
    });

    it("sends harness-exited event with exit code 0", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 });

      const client = new HostApiClient({
        baseUrl: "http://localhost:3000",
        runId: "run-123" as never,
        taskId: "task-456" as never,
        driverToken: "secret-token",
      });

      await client.sendLifecycleEvent({
        kind: "harness-exited",
        exitCode: 0,
        signal: null,
      });

      const [, options] = fetchMock.mock.calls[0];
      expect(JSON.parse(options.body as string)).toEqual({
        kind: "harness-exited",
        exitCode: 0,
        signal: null,
      });
    });

    it("sends harness-exited event with non-zero exit code", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 });

      const client = new HostApiClient({
        baseUrl: "http://localhost:3000",
        runId: "run-123" as never,
        taskId: "task-456" as never,
        driverToken: "secret-token",
      });

      await client.sendLifecycleEvent({
        kind: "harness-exited",
        exitCode: 1,
        signal: null,
      });

      const [, options] = fetchMock.mock.calls[0];
      expect(JSON.parse(options.body as string)).toEqual({
        kind: "harness-exited",
        exitCode: 1,
        signal: null,
      });
    });

    it("sends harness-exited event with signal", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 });

      const client = new HostApiClient({
        baseUrl: "http://localhost:3000",
        runId: "run-123" as never,
        taskId: "task-456" as never,
        driverToken: "secret-token",
      });

      await client.sendLifecycleEvent({
        kind: "harness-exited",
        exitCode: 137,
        signal: "SIGKILL",
      });

      const [, options] = fetchMock.mock.calls[0];
      expect(JSON.parse(options.body as string)).toEqual({
        kind: "harness-exited",
        exitCode: 137,
        signal: "SIGKILL",
      });
    });

    it("logs error when server returns non-OK response", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const client = new HostApiClient({
        baseUrl: "http://localhost:3000",
        runId: "run-123" as never,
        taskId: "task-456" as never,
        driverToken: "secret-token",
      });

      await client.sendLifecycleEvent({
        kind: "harness-starting",
        harnessCommand: "echo hello",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to send lifecycle event to host: 500 Internal Server Error",
      );
      consoleErrorSpy.mockRestore();
    });

    it("includes driver token in all lifecycle requests", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 });

      const client = new HostApiClient({
        baseUrl: "http://localhost:3000",
        runId: "run-123" as never,
        taskId: "task-456" as never,
        driverToken: "my-driver-token-12345",
      });

      // Send harness-starting
      await client.sendLifecycleEvent({
        kind: "harness-starting",
        harnessCommand: "echo hello",
      });

      let [, options] = fetchMock.mock.calls[0];
      expect(options.headers).toMatchObject({
        "X-MAL-Driver-Token": "my-driver-token-12345",
      });

      // Send harness-exited
      await client.sendLifecycleEvent({
        kind: "harness-exited",
        exitCode: 0,
        signal: null,
      });

      [, options] = fetchMock.mock.calls[1];
      expect(options.headers).toMatchObject({
        "X-MAL-Driver-Token": "my-driver-token-12345",
      });
    });
  });

  describe("authentication header", () => {
    it("uses X-MAL-Driver-Token header name", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 });

      const client = new HostApiClient({
        baseUrl: "http://localhost:3000",
        runId: "run-123" as never,
        taskId: "task-456" as never,
        driverToken: "token-with-special-chars!@#$%",
      });

      await client.sendLog({
        message: "test",
        stream: "stdout",
      });

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers).toHaveProperty("X-MAL-Driver-Token");
      expect(options.headers["X-MAL-Driver-Token"]).toBe(
        "token-with-special-chars!@#$%",
      );
    });

    it("uses same header for log and lifecycle endpoints", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 });

      const client = new HostApiClient({
        baseUrl: "http://localhost:3000",
        runId: "run-123" as never,
        taskId: "task-456" as never,
        driverToken: "shared-token",
      });

      await client.sendLog({ message: "log", stream: "stdout" });
      await client.sendLifecycleEvent({
        kind: "harness-starting",
        harnessCommand: "echo",
      });

      const [, logOptions] = fetchMock.mock.calls[0];
      const [, lifecycleOptions] = fetchMock.mock.calls[1];

      expect(logOptions.headers["X-MAL-Driver-Token"]).toBe(
        lifecycleOptions.headers["X-MAL-Driver-Token"],
      );
      expect(logOptions.headers["X-MAL-Driver-Token"]).toBe("shared-token");
    });
  });
});
