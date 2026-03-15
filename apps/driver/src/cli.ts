import { parseArgs } from "node:util";
import { runIdSchema, subtaskIdSchema, taskIdSchema } from "@mono/api";
import z from "zod";

export const driverInvocationSchema = z.object({
  runId: runIdSchema,
  taskId: taskIdSchema,
  subtaskId: subtaskIdSchema.optional(),
  taskFilePath: z.string().trim().min(1),
  hostApiBaseUrl: z.url(),
  driverToken: z.string().trim().min(1),
  harnessCommand: z.string().trim().min(1),
  retryLimit: z.coerce.number().int().min(0),
});

export type DriverInvocation = z.infer<typeof driverInvocationSchema>;

export function parseDriverInvocation(
  argv: readonly string[],
): DriverInvocation {
  const { values } = parseArgs({
    args: [...argv],
    allowPositionals: false,
    strict: true,
    options: {
      "run-id": { type: "string" },
      "task-id": { type: "string" },
      "subtask-id": { type: "string" },
      "task-file-path": { type: "string" },
      "host-api-base-url": { type: "string" },
      "driver-token": { type: "string" },
      "harness-command": { type: "string" },
      "retry-limit": { type: "string" },
    },
  });

  return driverInvocationSchema.parse({
    runId: values["run-id"],
    taskId: values["task-id"],
    subtaskId: values["subtask-id"],
    taskFilePath: values["task-file-path"],
    hostApiBaseUrl: values["host-api-base-url"],
    driverToken: values["driver-token"],
    harnessCommand: values["harness-command"],
    retryLimit: values["retry-limit"],
  });
}
