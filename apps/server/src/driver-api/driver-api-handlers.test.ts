import { driverApi } from "@mono/driver-api";
import { createHonoServer } from "cerato";
import { describe, expect, it } from "vitest";
import type { RunId } from "../runs/RunId";
import { CapturingLogger, FakeDatabase, FakeRunsService } from "../test-fakes";
import { InMemoryDriverRunTokenStore } from "./DriverRunTokenStore";
import { driverApiHandlers } from "./driver-api-handlers";

const RUN_ID = "run-1" as RunId;
const DRIVER_TOKEN = "driver-secret-token";

function createApp() {
  const driverRunTokenStore = new InMemoryDriverRunTokenStore();
  const db = new FakeDatabase();
  const runsService = new FakeRunsService();
  const logger = new CapturingLogger();
  const services = {
    db: db.asDatabase(),
    driverRunTokenStore,
    runsService,
    logger,
  };

  const app = createHonoServer(
    driverApi,
    {
      internal: driverApiHandlers,
    },
    services as never,
  );

  return { app, services, driverRunTokenStore, db, runsService, logger };
}

describe("driver api handlers", () => {
  describe("authentication", () => {
    it("rejects log requests without a driver token", async () => {
      const { app } = createApp();

      const response = await app.request(
        `http://localhost/api/internal/driver/runs/${RUN_ID}/logs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "test", stream: "stdout" }),
        },
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        code: "unauthenticated",
      });
    });

    it("rejects lifecycle requests without a driver token", async () => {
      const { app } = createApp();

      const response = await app.request(
        `http://localhost/api/internal/driver/runs/${RUN_ID}/lifecycle`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "harness-starting",
            harnessCommand: "echo hello",
          }),
        },
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        code: "unauthenticated",
      });
    });

    it("rejects requests with an invalid driver token", async () => {
      const { app, driverRunTokenStore, runsService } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      runsService.seedRun({
        id: RUN_ID,
        taskId: "task-1" as never,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/api/internal/driver/runs/${RUN_ID}/logs`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": "wrong-token",
          },
          body: JSON.stringify({
            message: "test log",
            stream: "stdout",
          }),
        },
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        code: "unauthenticated",
        message: "Driver token is invalid.",
      });
      expect(runsService.getRunCallCount).toBe(0);
    });
  });

  describe("logs endpoint", () => {
    it("returns 404 when run does not exist", async () => {
      const { app, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);

      const response = await app.request(
        `http://localhost/api/internal/driver/runs/${RUN_ID}/logs`,
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

    it("accepts valid log events", async () => {
      const { app, driverRunTokenStore, runsService, db, logger } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      runsService.seedRun({
        id: RUN_ID,
        taskId: "task-1" as never,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/api/internal/driver/runs/${RUN_ID}/logs`,
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

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(db.transactionCount).toBe(1);
      expect(logger.infos).toContainEqual([
        "test log message",
        { runId: RUN_ID, stream: "stdout" },
      ]);
      expect(logger.errors).toHaveLength(0);
    });

    it("logs stderr events as errors with structured run data", async () => {
      const { app, driverRunTokenStore, runsService, logger } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      runsService.seedRun({
        id: RUN_ID,
        taskId: "task-1" as never,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/api/internal/driver/runs/${RUN_ID}/logs`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-MAL-Driver-Token": DRIVER_TOKEN,
          },
          body: JSON.stringify({
            message: "test error message",
            stream: "stderr",
          }),
        },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(logger.errors).toContainEqual([
        "test error message",
        { runId: RUN_ID, stream: "stderr" },
      ]);
      expect(logger.infos).toHaveLength(0);
    });
  });

  describe("lifecycle endpoint", () => {
    it("returns 404 when run does not exist", async () => {
      const { app, driverRunTokenStore } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);

      const response = await app.request(
        `http://localhost/api/internal/driver/runs/${RUN_ID}/lifecycle`,
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

    it("accepts lifecycle events", async () => {
      const { app, driverRunTokenStore, runsService, db, logger } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      runsService.seedRun({
        id: RUN_ID,
        taskId: "task-1" as never,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/api/internal/driver/runs/${RUN_ID}/lifecycle`,
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

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(db.transactionCount).toBe(1);
      expect(logger.infos).toContainEqual([
        "Driver harness exited",
        {
          runId: RUN_ID,
          exitCode: 0,
          signal: null,
        },
      ]);
    });

    it("logs harness start events with structured run data", async () => {
      const { app, driverRunTokenStore, runsService, logger } = createApp();
      driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
      runsService.seedRun({
        id: RUN_ID,
        taskId: "task-1" as never,
        startedAt: new Date(),
        state: "in_progress",
      });

      const response = await app.request(
        `http://localhost/api/internal/driver/runs/${RUN_ID}/lifecycle`,
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

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(logger.infos).toContainEqual([
        "Driver harness starting",
        {
          runId: RUN_ID,
          harnessCommand: "echo hello",
        },
      ]);
    });
  });
});
