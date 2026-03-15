import { type MyAgentLoopApi, ok } from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import type { Services } from "../services";
import { RUN_QUEUE } from "../workflow/workflow-queues";

export const adminHandlers: HonoHandlersFor<
  ["admin"],
  MyAgentLoopApi["admin"],
  Services
> = {
  GET: async (ctx) => {
    const runQueue = ctx.services.workflowQueues.runQueue;
    const jobCounts = await runQueue.getJobCounts();

    return ok({
      queues: [
        {
          name: RUN_QUEUE,
          jobCounts: {
            waiting: jobCounts.waiting ?? 0,
            active: jobCounts.active ?? 0,
            completed: jobCounts.completed ?? 0,
            failed: jobCounts.failed ?? 0,
            delayed: jobCounts.delayed ?? 0,
            paused: jobCounts.paused ?? 0,
          },
        },
      ],
    });
  },
  "clear-queue": async (ctx) => {
    const { queueName } = ctx.body;

    if (queueName === RUN_QUEUE) {
      await ctx.services.workflowQueues.runQueue.obliterate({ force: true });
      return ok({ success: true });
    }

    return ok({ success: false });
  },
};
