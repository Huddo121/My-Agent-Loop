import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeHarnessCommand,
  type HarnessExecutionResult,
} from "./harness-process";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual("node:child_process");
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

describe("harness-process", () => {
  let spawnMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spawnMock = vi.fn();
    vi.mocked(spawn).mockImplementation(spawnMock as never);
  });

  describe("executeHarnessCommand", () => {
    it("executes command and returns exit code 0", async () => {
      const mockStdout = new Readable({
        read() {
          this.push("output line\n");
          this.push(null);
        },
      });
      const mockStderr = new Readable({
        read() {
          this.push(null);
        },
      });

      const mockChild = {
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === "exit") {
            // Simulate process exiting with code 0
            setImmediate(() => callback(0, null));
          }
          return mockChild;
        }),
      } as unknown as ReturnType<typeof spawn>;

      spawnMock.mockReturnValue(mockChild);

      let capturedStreams: { stdout: Readable; stderr: Readable } | undefined;
      const result = await executeHarnessCommand(
        {
          command: "echo hello",
          cwd: "/test/dir",
        },
        (streams) => {
          capturedStreams = streams;
        },
      );

      expect(spawnMock).toHaveBeenCalledWith("sh", ["-lc", "echo hello"], {
        cwd: "/test/dir",
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });

      expect(capturedStreams).toBeDefined();
      expect(capturedStreams?.stdout).toBe(mockStdout);
      expect(capturedStreams?.stderr).toBe(mockStderr);

      expect(result.exitCode).toBe(0);
      expect(result.signal).toBeNull();
    });

    it("executes command and returns non-zero exit code", async () => {
      const mockStdout = new Readable({
        read() {
          this.push(null);
        },
      });
      const mockStderr = new Readable({
        read() {
          this.push(null);
        },
      });

      const mockChild = {
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === "exit") {
            setImmediate(() => callback(1, null));
          }
          return mockChild;
        }),
      } as unknown as ReturnType<typeof spawn>;

      spawnMock.mockReturnValue(mockChild);

      const result = await executeHarnessCommand(
        {
          command: "exit 1",
          cwd: "/test/dir",
        },
        () => {},
      );

      expect(result.exitCode).toBe(1);
      expect(result.signal).toBeNull();
    });

    it("handles process killed by signal", async () => {
      const mockStdout = new Readable({
        read() {
          this.push(null);
        },
      });
      const mockStderr = new Readable({
        read() {
          this.push(null);
        },
      });

      const mockChild = {
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === "exit") {
            setImmediate(() => callback(null, "SIGKILL"));
          }
          return mockChild;
        }),
      } as unknown as ReturnType<typeof spawn>;

      spawnMock.mockReturnValue(mockChild);

      const result = await executeHarnessCommand(
        {
          command: "sleep 100",
          cwd: "/test/dir",
        },
        () => {},
      );

      expect(result.exitCode).toBe(137);
      expect(result.signal).toBe("SIGKILL");
    });

    it("maps SIGTERM to the conventional shell exit code", async () => {
      const mockStdout = new Readable({
        read() {
          this.push(null);
        },
      });
      const mockStderr = new Readable({
        read() {
          this.push(null);
        },
      });

      const mockChild = {
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === "exit") {
            setImmediate(() => callback(null, "SIGTERM"));
          }
          return mockChild;
        }),
      } as unknown as ReturnType<typeof spawn>;

      spawnMock.mockReturnValue(mockChild);

      const result = await executeHarnessCommand(
        {
          command: "sleep 100",
          cwd: "/test/dir",
        },
        () => {},
      );

      expect(result.exitCode).toBe(143);
      expect(result.signal).toBe("SIGTERM");
    });

    it("rejects when stdout/stderr cannot be captured", async () => {
      const mockChild = {
        stdout: null,
        stderr: null,
        on: vi.fn(),
      } as unknown as ReturnType<typeof spawn>;

      spawnMock.mockReturnValue(mockChild);

      await expect(
        executeHarnessCommand(
          {
            command: "echo hello",
            cwd: "/test/dir",
          },
          () => {},
        ),
      ).rejects.toThrow("Failed to capture harness stdout/stderr");
    });

    it("forwards process error to rejection", async () => {
      const mockStdout = new Readable({
        read() {
          this.push(null);
        },
      });
      const mockStderr = new Readable({
        read() {
          this.push(null);
        },
      });

      const mockChild = {
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === "error") {
            setImmediate(() => callback(new Error("ENOENT")));
          }
          return mockChild;
        }),
      } as unknown as ReturnType<typeof spawn>;

      spawnMock.mockReturnValue(mockChild);

      await expect(
        executeHarnessCommand(
          {
            command: "nonexistent-command",
            cwd: "/test/dir",
          },
          () => {},
        ),
      ).rejects.toThrow("ENOENT");
    });

    it("converts null signal to exit code 1", async () => {
      const mockStdout = new Readable({
        read() {
          this.push(null);
        },
      });
      const mockStderr = new Readable({
        read() {
          this.push(null);
        },
      });

      const mockChild = {
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === "exit") {
            // Pass null code and null signal - unusual but possible
            setImmediate(() => callback(null, null));
          }
          return mockChild;
        }),
      } as unknown as ReturnType<typeof spawn>;

      spawnMock.mockReturnValue(mockChild);

      const result = await executeHarnessCommand(
        {
          command: "some command",
          cwd: "/test/dir",
        },
        () => {},
      );

      // signalToExitCode returns 1 for null signal
      expect(result.exitCode).toBe(1);
      expect(result.signal).toBeNull();
    });

    it("passes current environment variables", async () => {
      const mockStdout = new Readable({
        read() {
          this.push(null);
        },
      });
      const mockStderr = new Readable({
        read() {
          this.push(null);
        },
      });

      const mockChild = {
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === "exit") {
            setImmediate(() => callback(0, null));
          }
          return mockChild;
        }),
      } as unknown as ReturnType<typeof spawn>;

      spawnMock.mockReturnValue(mockChild);

      await executeHarnessCommand(
        {
          command: "echo hello",
          cwd: "/test/dir",
        },
        () => {},
      );

      const [command, args, spawnOptions] = spawnMock.mock.calls[0];
      expect(command).toBe("sh");
      expect(args).toEqual(["-lc", "echo hello"]);
      // Check that env is passed (it's a reference to process.env)
      expect(spawnOptions).toHaveProperty("env");
    });
  });

  describe("HarnessExecutionResult type", () => {
    it("has correct shape for successful execution", async () => {
      const mockStdout = new Readable({
        read() {
          this.push(null);
        },
      });
      const mockStderr = new Readable({
        read() {
          this.push(null);
        },
      });

      const mockChild = {
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === "exit") {
            setImmediate(() => callback(0, null));
          }
          return mockChild;
        }),
      } as unknown as ReturnType<typeof spawn>;

      spawnMock.mockReturnValue(mockChild);

      const result: HarnessExecutionResult = await executeHarnessCommand(
        {
          command: "true",
          cwd: "/test",
        },
        () => {},
      );

      // Type check - these should compile
      expect(typeof result.exitCode).toBe("number");
      expect(result.signal === null || typeof result.signal === "string").toBe(
        true,
      );
    });
  });
});
