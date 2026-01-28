import { Endpoint } from "cerato";
import z from "zod";

export const queueStatsResponseSchema = z.object({
  runQueue: z.object({
    waiting: z.number(),
    active: z.number(),
    completed: z.number(),
    failed: z.number(),
    delayed: z.number(),
    total: z.number(),
  }),
  metadata: z.object({
    oldestJobTimestamp: z.number().nullable(),
    newestJobTimestamp: z.number().nullable(),
    averageWaitTime: z.number().nullable(),
    queueName: z.string(),
    isWorkerRunning: z.boolean(),
  }),
});
export type QueueStatsResponse = z.infer<typeof queueStatsResponseSchema>;

export const adminApi = Endpoint.multi({
  stats: Endpoint.get().output(200, queueStatsResponseSchema),
});

export type AdminApi = typeof adminApi;
