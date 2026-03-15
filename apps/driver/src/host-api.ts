import {
  type RunId,
  type SubtaskId,
  subtaskSchema,
  type TaskId,
} from "@mono/api";
import z from "zod";
import type { DriverTaskFile } from "./task-file";

const DRIVER_TOKEN_HEADER = "X-MAL-Driver-Token";

const driverTaskSnapshotSchema = z.object({
  title: z.string(),
  description: z.string(),
  subtasks: z.array(subtaskSchema),
});

const syncTaskSnapshotRequestSchema = z.object({
  taskSnapshot: driverTaskSnapshotSchema,
  subtaskId: z.string().optional(),
  iteration: z.number().int().min(1),
  harnessExitCode: z.number().int(),
  progressState: z.enum(["none", "progress", "complete"]),
  progressReason: z.string(),
});

export type SyncTaskSnapshotInput = z.infer<
  typeof syncTaskSnapshotRequestSchema
>;

export class HostApiClient {
  constructor(
    private readonly options: {
      baseUrl: string;
      runId: RunId;
      taskId: TaskId;
      subtaskId?: SubtaskId;
      driverToken: string;
    },
  ) {}

  async readCanonicalTaskSnapshot(): Promise<DriverTaskFile> {
    const response = await fetch(this.buildTaskUrl(), {
      method: "GET",
      headers: this.headers(),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to read canonical task snapshot: ${response.status} ${response.statusText}`,
      );
    }

    const parsed = driverTaskSnapshotSchema.parse(await response.json());
    return parsed;
  }

  async syncTaskSnapshot(input: SyncTaskSnapshotInput): Promise<void> {
    const request = syncTaskSnapshotRequestSchema.parse(input);
    const response = await fetch(this.buildTaskUrl(), {
      method: "PUT",
      headers: {
        ...this.headers(),
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to persist task snapshot: ${response.status} ${response.statusText}`,
      );
    }
  }

  private buildTaskUrl(): URL {
    const url = new URL(
      `/internal/driver/runs/${this.options.runId}/tasks/${this.options.taskId}`,
      this.options.baseUrl,
    );

    if (this.options.subtaskId !== undefined) {
      url.searchParams.set("subtaskId", this.options.subtaskId);
    }

    return url;
  }

  private headers(): Record<string, string> {
    return {
      [DRIVER_TOKEN_HEADER]: this.options.driverToken,
    };
  }
}
