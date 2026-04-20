import {
  createDriverApiClient,
  DRIVER_TOKEN_HEADER,
  type DriverApiClient,
  type DriverApiPostResponse,
  type DriverLifecycleEvent,
  type DriverLogEvent,
} from "@mono/driver-api";

export class HostApiClient {
  private readonly client: DriverApiClient;

  constructor(
    private readonly options: {
      baseUrl: string;
      runId: string;
      driverToken: string;
    },
  ) {
    this.client = createDriverApiClient(this.options.baseUrl);
  }

  async sendLog(event: DriverLogEvent): Promise<void> {
    try {
      const response = await this.client.internal.driver.runs[
        ":runId"
      ].logs.POST({
        pathParams: { runId: this.options.runId },
        headers: this.headers(),
        body: event,
      });

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
      const response = await this.client.internal.driver.runs[
        ":runId"
      ].lifecycle.POST({
        pathParams: { runId: this.options.runId },
        headers: this.headers(),
        body: event,
      });

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

  private logUnexpectedResponse(
    requestLabel: string,
    response: DriverApiPostResponse,
  ): void {
    if (response.status !== 200) {
      const responseCode =
        "code" in response.responseBody
          ? response.responseBody.code
          : undefined;

      console.error(
        `Failed to send ${requestLabel} to host: ${response.status} ${responseCode ?? "unknown-error"}`,
      );
    }
  }
}
