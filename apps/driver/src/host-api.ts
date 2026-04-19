import {
  DRIVER_TOKEN_HEADER,
  type DriverLifecycleEvent,
  type DriverLogEvent,
} from "@mono/driver-api";

export class HostApiClient {
  constructor(
    private readonly options: {
      baseUrl: string;
      runId: string;
      driverToken: string;
    },
  ) {}

  async sendLog(event: DriverLogEvent): Promise<void> {
    try {
      const response = await this.postToHost("logs", event);

      this.logUnexpectedResponse("log", response);
    } catch (error) {
      console.error(
        "Failed to send log to host due to transport error:",
        error,
      );
    }
  }

  async sendLifecycleEvent(event: DriverLifecycleEvent): Promise<void> {
    try {
      const response = await this.postToHost("lifecycle", event);

      this.logUnexpectedResponse("lifecycle event", response);
    } catch (error) {
      console.error(
        "Failed to send lifecycle event to host due to transport error:",
        error,
      );
    }
  }

  private headers(): Record<typeof DRIVER_TOKEN_HEADER, string> {
    return {
      [DRIVER_TOKEN_HEADER]: this.options.driverToken,
    };
  }

  private async postToHost(
    endpoint: "logs" | "lifecycle",
    body: DriverLogEvent | DriverLifecycleEvent,
  ): Promise<HostResponse> {
    const response = await fetch(this.urlFor(endpoint), {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...this.headers(),
      },
    });

    return {
      status: response.status,
      responseBody: await parseResponseBody(response),
    };
  }

  private urlFor(endpoint: "logs" | "lifecycle"): string {
    const baseUrl = this.options.baseUrl.endsWith("/")
      ? this.options.baseUrl.slice(0, -1)
      : this.options.baseUrl;

    return `${baseUrl}/api/internal/driver/runs/${encodeURIComponent(this.options.runId)}/${endpoint}`;
  }

  private logUnexpectedResponse(
    requestLabel: string,
    response: HostResponse,
  ): void {
    if (response.status !== 200) {
      const responseCode = isObjectWithCode(response.responseBody)
        ? response.responseBody.code
        : undefined;

      console.error(
        `Failed to send ${requestLabel} to host: ${response.status} ${responseCode ?? "unknown-error"}`,
      );
    }
  }
}

type HostResponse = {
  status: number;
  responseBody: unknown;
};

async function parseResponseBody(response: Response): Promise<unknown> {
  const responseText = await response.text();
  if (responseText.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return undefined;
  }
}

function isObjectWithCode(value: unknown): value is { code: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string"
  );
}
