import {
  DRIVER_TOKEN_HEADER,
  type DriverLifecycleEvent,
  type DriverLogEvent,
} from "@mono/driver-api";
import z from "zod";

const hostResponseBodySchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({
    result: z.literal("error"),
    code: z.string(),
    message: z.string().optional(),
  }),
]);

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
    const url = new URL(this.options.baseUrl);
    url.pathname = `/api/internal/driver/runs/${this.options.runId}/${endpoint}`;
    url.search = "";

    return url.toString();
  }

  private logUnexpectedResponse(
    requestLabel: string,
    response: HostResponse,
  ): void {
    if (response.status !== 200) {
      const responseCode =
        response.responseBody !== undefined && "code" in response.responseBody
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
  responseBody: HostResponseBody | undefined;
};

type HostResponseBody = z.infer<typeof hostResponseBodySchema>;

async function parseResponseBody(
  response: Response,
): Promise<HostResponseBody | undefined> {
  const responseText = await response.text();
  if (responseText.length === 0) {
    return undefined;
  }

  let responseJson: unknown;
  try {
    responseJson = JSON.parse(responseText);
  } catch (error) {
    console.error("Failed to parse host response as JSON", {
      status: response.status,
      body: responseText,
      error,
    });
    return undefined;
  }

  const parseResult = hostResponseBodySchema.safeParse(responseJson);
  if (!parseResult.success) {
    console.error("Failed to parse host response body", {
      status: response.status,
      body: responseJson,
      error: parseResult.error,
    });
    return undefined;
  }

  return parseResult.data;
}
