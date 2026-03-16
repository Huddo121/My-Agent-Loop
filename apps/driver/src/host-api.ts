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
    await this.post(
      this.buildLogUrl(),
      {
        message: params.message,
        stream: params.stream,
      },
      "log",
    );
  }

  async sendLifecycleEvent(event: LifecycleEvent): Promise<void> {
    await this.post(this.buildLifecycleUrl(), event, "lifecycle event");
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

  private async post(
    url: URL,
    body: unknown,
    requestLabel: string,
  ): Promise<void> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...this.headers(),
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.error(
          `Failed to send ${requestLabel} to host: ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error(
        `Failed to send ${requestLabel} to host due to transport error:`,
        error,
      );
    }
  }
}
