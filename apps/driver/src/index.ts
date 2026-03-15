import { parseArgs } from "node:util";
import { runIdSchema, subtaskIdSchema, taskIdSchema } from "@mono/api";
import z from "zod";

const driverInvocationSchema = z.object({
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

async function main(): Promise<void> {
  const invocation = parseDriverInvocation(process.argv.slice(2));

  console.log(
    `Driver bootstrap ready for run ${invocation.runId} task ${invocation.taskId}`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof z.ZodError) {
    console.error("Invalid driver invocation:");
    for (const issue of error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "argument";
      console.error(`- ${path}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error("Driver failed with an unknown error.");
  process.exitCode = 1;
});
