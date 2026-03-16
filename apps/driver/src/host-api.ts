import type { RunId, TaskId } from "@mono/api";

const DRIVER_TOKEN_HEADER = "X-MAL-Driver-Token";

export type LifecycleEvent =
  | {
      kind: "harness-starting";
      harnessCommand: string;
    }
  | {
      kind: "harness-exited";
      exitCode: number;
      signal: string | null;
    };

export class HostApiClient {
  constructor(
    private readonly options: {
      baseUrl: string;
      runId: RunId;
      taskId: TaskId;
      driverToken: string;
    },
  ) {}

  async sendLog(params: {
    message: string;
    stream: "stdout" | "stderr";
  }): Promise<void> {
    const response = await fetch(this.buildLogUrl(), {
      method: "POST",
      headers: {
        ...this.headers(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: params.message,
        stream: params.stream,
      }),
    });

    if (!response.ok) {
      console.error(
        `Failed to send log to host: ${response.status} ${response.statusText}`,
      );
    }
  }

  async sendLifecycleEvent(event: LifecycleEvent): Promise<void> {
    const response = await fetch(this.buildLifecycleUrl(), {
      method: "POST",
      headers: {
        ...this.headers(),
        "content-type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.error(
        `Failed to send lifecycle event to host: ${response.status} ${response.statusText}`,
      );
    }
  }

  private buildLogUrl(): URL {
    return new URL(
      `/internal/driver/runs/${this.options.runId}/tasks/${this.options.taskId}/logs`,
      this.options.baseUrl,
    );
  }

  private buildLifecycleUrl(): URL {
    return new URL(
      `/internal/driver/runs/${this.options.runId}/tasks/${this.options.taskId}/lifecycle`,
      this.options.baseUrl,
    );
  }

  private headers(): Record<string, string> {
    return {
      [DRIVER_TOKEN_HEADER]: this.options.driverToken,
    };
  }
}
