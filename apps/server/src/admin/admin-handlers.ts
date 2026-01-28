import { type MyAgentLoopApi, ok, type QueueStatsResponse } from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import type { Services } from "../services";

export const adminHandlers: HonoHandlersFor<
  ["admin"],
  MyAgentLoopApi["admin"],
  Services
> = {
  stats: async (ctx) => {
    try {
      const runQueue = ctx.services.workflowQueues.runQueue;
      const [_waiting, _active, _completed, _failed, _delayed] =
        await Promise.all([
          runQueue.getWaiting(),
          runQueue.getActive(),
          runQueue.getCompleted(),
          runQueue.getFailed(),
          runQueue.getDelayed(),
        ]);

      const [
        getWaitingCount,
        getActiveCount,
        getCompletedCount,
        getFailedCount,
        getDelayedCount,
      ] = await Promise.all([
        runQueue.getWaitingCount(),
        runQueue.getActiveCount(),
        runQueue.getCompletedCount(),
        runQueue.getFailedCount(),
        runQueue.getDelayedCount(),
      ]);

      const jobs = await runQueue.getJobs("waiting", 0, 1, true);
      const oldestJob = jobs.length > 0 ? jobs[0] : null;

      const newestJobs = await runQueue.getJobs("waiting", -1, 1, true);
      const newestJob = newestJobs.length > 0 ? newestJobs[0] : null;

      const workerCount = (await runQueue.getWorkers()).length;

      const response: QueueStatsResponse = {
        runQueue: {
          waiting: getWaitingCount,
          active: getActiveCount,
          completed: getCompletedCount,
          failed: getFailedCount,
          delayed: getDelayedCount,
          total:
            getWaitingCount +
            getActiveCount +
            getCompletedCount +
            getFailedCount +
            getDelayedCount,
        },
        metadata: {
          oldestJobTimestamp: oldestJob?.timestamp || null,
          newestJobTimestamp: newestJob?.timestamp || null,
          averageWaitTime:
            oldestJob && newestJob
              ? (newestJob.timestamp - oldestJob.timestamp) /
                (getWaitingCount || 1) /
                1000
              : null,
          queueName: runQueue.name,
          isWorkerRunning: workerCount > 0,
        },
      };

      return ok(response);
    } catch (error) {
      console.error("Error fetching queue stats:", error);
      return ok({
        runQueue: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          total: 0,
        },
        metadata: {
          oldestJobTimestamp: null,
          newestJobTimestamp: null,
          averageWaitTime: null,
          queueName: "run-queue",
          isWorkerRunning: false,
        },
      } as QueueStatsResponse);
    }
  },
};
