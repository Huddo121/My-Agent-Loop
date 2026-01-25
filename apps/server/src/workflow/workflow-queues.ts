import type { ProjectId, TaskId } from "@mono/api";
import { Queue } from "bullmq";
import type { RunId } from "../runs/RunId";
import type { RunMode } from "../runs/runs-model";

export const RUN_QUEUE = "run-queue";
export type RunQueueJobPayload = {
  projectId: ProjectId;
  taskId: TaskId;
  runId: RunId;
  mode: RunMode;
};

export class WorkflowQueues {
  public readonly runQueue: Queue;
  constructor(redisHost: string) {
    const redisConnection = { connection: { host: redisHost } } as const;
    this.runQueue = new Queue(RUN_QUEUE, redisConnection);
  }
}
