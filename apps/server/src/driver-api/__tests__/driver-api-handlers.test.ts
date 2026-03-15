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
    },
    taskQueue: {
      getTask: vi.fn(),
      updateTask: vi.fn(),
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

  it("rejects requests without a driver token", async () => {
    const { app } = createApp();

    const response = await app.request(
      `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}`,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("returns the canonical task snapshot for an authenticated run", async () => {
    const { app, services, driverRunTokenStore } = createApp();
    driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
    services.runsService.getRun.mockResolvedValueOnce({
      id: RUN_ID,
      taskId: TASK_ID,
      startedAt: new Date(),
      state: "in_progress",
    });
    services.taskQueue.getTask.mockResolvedValueOnce({
      id: TASK_ID,
      title: "Implement driver API",
      description: "Persist task snapshots after each iteration.",
      subtasks: [
        {
          id: "subtask-1",
          title: "Add auth",
          state: "in-progress",
        },
      ],
    });

    const response = await app.request(
      `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}?subtaskId=subtask-1`,
      {
        headers: {
          "X-MAL-Driver-Token": DRIVER_TOKEN,
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      title: "Implement driver API",
      description: "Persist task snapshots after each iteration.",
      subtasks: [
        {
          id: "subtask-1",
          title: "Add auth",
          state: "in-progress",
        },
      ],
    });
  });

  it("rejects invalid driver tokens", async () => {
    const { app, driverRunTokenStore } = createApp();
    driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);

    const response = await app.request(
      `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}`,
      {
        headers: {
          "X-MAL-Driver-Token": "wrong-token",
        },
      },
    );

    expect(response.status).toBe(401);
  });

  it("persists the latest task snapshot for an authenticated run", async () => {
    const { app, services, driverRunTokenStore } = createApp();
    driverRunTokenStore.setToken(RUN_ID, DRIVER_TOKEN);
    services.runsService.getRun.mockResolvedValueOnce({
      id: RUN_ID,
      taskId: TASK_ID,
      startedAt: new Date(),
      state: "in_progress",
    });
    services.taskQueue.getTask.mockResolvedValueOnce({
      id: TASK_ID,
      title: "Before",
      description: "Before",
      subtasks: [
        {
          id: "subtask-1",
          title: "Existing",
          state: "pending",
        },
      ],
    });
    services.taskQueue.updateTask.mockResolvedValueOnce({
      id: TASK_ID,
      title: "After",
      description: "After",
      subtasks: [
        {
          id: "subtask-1",
          title: "Existing",
          state: "completed",
        },
      ],
    });

    const response = await app.request(
      `http://localhost/internal/driver/runs/${RUN_ID}/tasks/${TASK_ID}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "X-MAL-Driver-Token": DRIVER_TOKEN,
        },
        body: JSON.stringify({
          taskSnapshot: {
            title: "After",
            description: "After",
            subtasks: [
              {
                id: "subtask-1",
                title: "Existing",
                state: "completed",
              },
            ],
          },
          subtaskId: "subtask-1",
          iteration: 2,
          harnessExitCode: 0,
          progressState: "progress",
          progressReason: "Completed the requested subtask.",
        }),
      },
    );

    expect(response.status).toBe(204);
    expect(services.taskQueue.updateTask).toHaveBeenCalledWith(TASK_ID, {
      title: "After",
      description: "After",
      subtasks: [
        {
          id: "subtask-1",
          title: "Existing",
          state: "completed",
        },
      ],
    });
  });
});
