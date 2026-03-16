import { parseArgs } from "node:util";
import { runIdSchema, taskIdSchema } from "@mono/api";
import z from "zod";

export const driverInvocationSchema = z.object({
  runId: runIdSchema,
  taskId: taskIdSchema,
  hostApiBaseUrl: z.string().url(),
  driverToken: z.string().trim().min(1),
  harnessCommand: z.string().trim().min(1),
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
      "host-api-base-url": { type: "string" },
      "driver-token": { type: "string" },
      "harness-command": { type: "string" },
    },
  });

  return driverInvocationSchema.parse({
    runId: values["run-id"],
    taskId: values["task-id"],
    hostApiBaseUrl: values["host-api-base-url"],
    driverToken: values["driver-token"],
    harnessCommand: values["harness-command"],
  });
}
