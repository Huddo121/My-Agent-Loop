import type { TaskId } from "@mono/api";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunId } from "../../runs/RunId";
import type { Run } from "../../runs/RunsService";
import { InMemoryDriverRunTokenStore } from "../DriverRunTokenStore";
import { registerDriverApiRoutes } from "../driver-api-handlers";

const RUN_ID = "run-1" as RunId;
const TASK_ID = "task-1" as TaskId;
const DRIVER_TOKEN = "driver-secret-token";

function createApp() {
  const driverRunTokenStore = new InMemoryDriverRunTokenStore();
  const services = {
    db: {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({}),
      ),
    },
    driverRunTokenStore,
    runsService: {
      getRun: vi.fn<() => Promise<Run | undefined>>(),
      updateRunState: vi.fn(),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };

  const app = new Hono();
  registerDriverApiRoutes(app, services as never);

  return { app, services, driverRunTokenStore };
}

describe("driver api handlers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("authentication", () => {
    it("rejects log requests without a driver token", async () => {
      const { app } = createApp();

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/logs`,
        { method: "POST" },
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        code: "unauthenticated",
      });
    });

    it("rejects lifecycle requests without a driver token", async () => {
      const { app } = createApp();

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/lifecycle`,
        { method: "POST" },
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        code: "unauthenticated",
      });
    });

    it("rejects invalid driver tokens for logs", async () => {
      const { app, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/logs`,
        {
          method: "POST",
          headers: {
            "X-MAL-Driver-Token": "wrong-token",
          },
        },
      );

      expect(response.status).toBe(401);
    });

    it("rejects invalid driver tokens for lifecycle", async () => {
      const { app, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/lifecycle`,
        {
          method: "POST",
          headers: {
            "X-MAL-Driver-Token": "wrong-token",
          },
        },
      );

      expect(response.status).toBe(401);
    });
  });

  describe("logs endpoint", () => {
    it("returns 404 when run does not exist", async () => {
      const { app, services, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      services.runsService.getRun.mockResolvedValueOnce(undefined);

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/logs`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": DRIVER_TOKEN,
          },
          body: JSON.stringify({
            message: "test log",
            stream: "stdout",
          }),
        },
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 when task does not match run", async () => {
      const { app, services, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      services.runsService.getRun.mockResolvedValueOnce({
        id: RUN_ID,
        taskId: "different-task-id" as TaskId,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/logs`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": DRIVER_TOKEN,
          },
          body: JSON.stringify({
            message: "test log",
            stream: "stdout",
          }),
        },
      );

      expect(response.status).toBe(404);
    });

    it("returns 400 for invalid log payload", async () => {
      const { app, services, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      services.runsService.getRun.mockResolvedValueOnce({
        id: RUN_ID,
        taskId: TASK_ID,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/logs`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": DRIVER_TOKEN,
          },
          body: JSON.stringify({
            // missing required fields
          }),
        },
      );

      expect(response.status).toBe(400);
    });

    it("accepts valid log events", async () => {
      const { app, services, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      services.runsService.getRun.mockResolvedValueOnce({
        id: RUN_ID,
        taskId: TASK_ID,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/logs`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": DRIVER_TOKEN,
          },
          body: JSON.stringify({
            message: "test log message",
            stream: "stdout",
          }),
        },
      );

      expect(response.status).toBe(204);
    });

    it("accepts stderr log events", async () => {
      const { app, services, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      services.runsService.getRun.mockResolvedValueOnce({
        id: RUN_ID,
        taskId: TASK_ID,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/logs`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": DRIVER_TOKEN,
          },
          body: JSON.stringify({
            message: "error message",
            stream: "stderr",
          }),
        },
      );

      expect(response.status).toBe(204);
    });
  });

  describe("lifecycle endpoint", () => {
    it("returns 404 when run does not exist", async () => {
      const { app, services, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      services.runsService.getRun.mockResolvedValueOnce(undefined);

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/lifecycle`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": DRIVER_TOKEN,
          },
          body: JSON.stringify({
            kind: "harness-starting",
            harnessCommand: "echo hello",
          }),
        },
      );

      expect(response.status).toBe(404);
    });

    it("returns 400 for invalid lifecycle payload", async () => {
      const { app, services, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      services.runsService.getRun.mockResolvedValueOnce({
        id: RUN_ID,
        taskId: TASK_ID,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/lifecycle`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": DRIVER_TOKEN,
          },
          body: JSON.stringify({
            // missing required fields
          }),
        },
      );

      expect(response.status).toBe(400);
    });

    it("accepts harness-starting lifecycle event", async () => {
      const { app, services, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      services.runsService.getRun.mockResolvedValueOnce({
        id: RUN_ID,
        taskId: TASK_ID,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/lifecycle`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": DRIVER_TOKEN,
          },
          body: JSON.stringify({
            kind: "harness-starting",
            harnessCommand: "echo hello",
          }),
        },
      );

      expect(response.status).toBe(204);
    });

    it("accepts harness-exited lifecycle event with exit code 0", async () => {
      const { app, services, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      services.runsService.getRun.mockResolvedValueOnce({
        id: RUN_ID,
        taskId: TASK_ID,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/lifecycle`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": DRIVER_TOKEN,
          },
          body: JSON.stringify({
            kind: "harness-exited",
            exitCode: 0,
            signal: null,
          }),
        },
      );

      expect(response.status).toBe(204);
      expect(services.runsService.updateRunState).toHaveBeenCalledWith(
        RUN_ID,
        "completed",
      );
    });

    it("accepts harness-exited lifecycle event with non-zero exit code", async () => {
      const { app, services, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      services.runsService.getRun.mockResolvedValueOnce({
        id: RUN_ID,
        taskId: TASK_ID,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/lifecycle`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": DRIVER_TOKEN,
          },
          body: JSON.stringify({
            kind: "harness-exited",
            exitCode: 1,
            signal: null,
          }),
        },
      );

      expect(response.status).toBe(204);
      expect(services.runsService.updateRunState).toHaveBeenCalledWith(
        RUN_ID,
        "failed",
      );
    });

    it("accepts harness-exited lifecycle event with signal", async () => {
      const { app, services, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      services.runsService.getRun.mockResolvedValueOnce({
        id: RUN_ID,
        taskId: TASK_ID,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}/lifecycle`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": DRIVER_TOKEN,
          },
          body: JSON.stringify({
            kind: "harness-exited",
            exitCode: 137,
            signal: "SIGKILL",
          }),
        },
      );

      expect(response.status).toBe(204);
      expect(services.runsService.updateRunState).toHaveBeenCalledWith(
        RUN_ID,
        "failed",
      );
    });
  });
});
