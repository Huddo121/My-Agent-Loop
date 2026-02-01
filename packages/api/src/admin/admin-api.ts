import { Endpoint } from "cerato";
import z from "zod";

export const jobCountsSchema = z.object({
  waiting: z.number(),
  active: z.number(),
  completed: z.number(),
  failed: z.number(),
  delayed: z.number(),
  paused: z.number(),
});

export const queueStatsSchema = z.object({
  name: z.string(),
  jobCounts: jobCountsSchema,
});

export const queueStatsResponseSchema = z.object({
  queues: z.array(queueStatsSchema),
});

export type QueueStatsResponse = z.infer<typeof queueStatsResponseSchema>;

export const adminApi = Endpoint.multi({
  GET: Endpoint.get().output(200, queueStatsResponseSchema),
  children: {
    "clear-queue": Endpoint.post()
      .input(z.object({ queueName: z.string() }))
      .output(200, z.object({ success: z.boolean() })),
  },
});
