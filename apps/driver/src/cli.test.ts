import { describe, expect, it } from "vitest";
import { driverInvocationSchema, parseDriverInvocation } from "./cli";

describe("CLI argument parsing", () => {
  describe("parseDriverInvocation", () => {
    it("parses valid CLI arguments", () => {
      const argv = [
        "--run-id",
        "run-123",
        "--task-id",
        "task-456",
        "--host-api-base-url",
        "http://localhost:3000",
        "--driver-token",
        "secret-token",
        "--harness-command",
        "echo hello",
      ];

      const result = parseDriverInvocation(argv);

      expect(result.runId).toBe("run-123");
      expect(result.taskId).toBe("task-456");
      expect(result.hostApiBaseUrl).toBe("http://localhost:3000");
      expect(result.driverToken).toBe("secret-token");
      expect(result.harnessCommand).toBe("echo hello");
    });

    it("throws on missing required argument", () => {
      const argv = [
        "--run-id",
        "run-123",
        // missing --task-id
        "--host-api-base-url",
        "http://localhost:3000",
        "--driver-token",
        "secret-token",
        "--harness-command",
        "echo hello",
      ];

      expect(() => parseDriverInvocation(argv)).toThrow();
    });

    it("throws on invalid URL format", () => {
      const argv = [
        "--run-id",
        "run-123",
        "--task-id",
        "task-456",
        "--host-api-base-url",
        "not-a-url",
        "--driver-token",
        "secret-token",
        "--harness-command",
        "echo hello",
      ];

      expect(() => parseDriverInvocation(argv)).toThrow();
    });

    it("throws on empty driver token", () => {
      const argv = [
        "--run-id",
        "run-123",
        "--task-id",
        "task-456",
        "--host-api-base-url",
        "http://localhost:3000",
        "--driver-token",
        "",
        "--harness-command",
        "echo hello",
      ];

      expect(() => parseDriverInvocation(argv)).toThrow();
    });

    it("throws on empty harness command", () => {
      const argv = [
        "--run-id",
        "run-123",
        "--task-id",
        "task-456",
        "--host-api-base-url",
        "http://localhost:3000",
        "--driver-token",
        "secret-token",
        "--harness-command",
        "",
      ];

      expect(() => parseDriverInvocation(argv)).toThrow();
    });

    it("throws on unknown argument", () => {
      const argv = [
        "--run-id",
        "run-123",
        "--task-id",
        "task-456",
        "--host-api-base-url",
        "http://localhost:3000",
        "--driver-token",
        "secret-token",
        "--harness-command",
        "echo hello",
        "--unknown-flag",
        "value",
      ];

      expect(() => parseDriverInvocation(argv)).toThrow();
    });

    it("accepts HTTPS URL", () => {
      const argv = [
        "--run-id",
        "run-123",
        "--task-id",
        "task-456",
        "--host-api-base-url",
        "https://api.production.example.com",
        "--driver-token",
        "secret-token",
        "--harness-command",
        "echo hello",
      ];

      const result = parseDriverInvocation(argv);

      expect(result.hostApiBaseUrl).toBe("https://api.production.example.com");
    });
  });

  describe("driverInvocationSchema", () => {
    it("validates correct invocation object", () => {
      const validInvocation = {
        runId: "run-123",
        taskId: "task-456",
        hostApiBaseUrl: "http://localhost:3000",
        driverToken: "secret-token",
        harnessCommand: "echo hello",
      };

      const result = driverInvocationSchema.safeParse(validInvocation);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validInvocation);
      }
    });

    it("rejects invalid URL", () => {
      const invalidInvocation = {
        runId: "run-123",
        taskId: "task-456",
        hostApiBaseUrl: "not-a-url",
        driverToken: "secret-token",
        harnessCommand: "echo hello",
      };

      const result = driverInvocationSchema.safeParse(invalidInvocation);

      expect(result.success).toBe(false);
    });

    it("rejects empty driver token", () => {
      const invalidInvocation = {
        runId: "run-123",
        taskId: "task-456",
        hostApiBaseUrl: "http://localhost:3000",
        driverToken: "   ",
        harnessCommand: "echo hello",
      };

      const result = driverInvocationSchema.safeParse(invalidInvocation);

      expect(result.success).toBe(false);
    });

    it("rejects empty harness command", () => {
      const invalidInvocation = {
        runId: "run-123",
        taskId: "task-456",
        hostApiBaseUrl: "http://localhost:3000",
        driverToken: "secret-token",
        harnessCommand: "",
      };

      const result = driverInvocationSchema.safeParse(invalidInvocation);

      expect(result.success).toBe(false);
    });
  });
});
