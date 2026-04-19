import {
  type ClientsForApi,
  createClientsFromApi,
  Endpoint,
  type FetchClientResult,
} from "cerato";
import z from "zod";

const badUserInputSchema = z.object({
  result: z.literal("error"),
  code: z.literal("bad-user-input"),
  message: z.string(),
});

const unauthenticatedSchema = z.object({
  result: z.literal("error"),
  code: z.literal("unauthenticated"),
  message: z.string().optional(),
});

const notFoundSchema = z.object({
  result: z.literal("error"),
  code: z.literal("not-found"),
  message: z.string().optional(),
});

export const DRIVER_TOKEN_HEADER = "X-MAL-Driver-Token";

export const driverRunIdSchema = z.string();
export type DriverRunId = z.infer<typeof driverRunIdSchema>;

export const driverLogEventSchema = z.object({
  message: z.string(),
  stream: z.enum(["stdout", "stderr"]),
});
export type DriverLogEvent = z.infer<typeof driverLogEventSchema>;

export const driverLifecycleEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("harness-starting"),
    harnessCommand: z.string(),
  }),
  z.object({
    kind: z.literal("harness-exited"),
    exitCode: z.number().int(),
    signal: z.string().nullable(),
  }),
]);
export type DriverLifecycleEvent = z.infer<typeof driverLifecycleEventSchema>;

export const driverAckSchema = z.object({
  ok: z.literal(true),
});
export type DriverAck = z.infer<typeof driverAckSchema>;

const authenticatedDriverPostEndpoint = Endpoint.post()
  .header(DRIVER_TOKEN_HEADER)
  .output(200, driverAckSchema)
  .output(400, badUserInputSchema)
  .output(401, unauthenticatedSchema)
  .output(404, notFoundSchema);

export const driverApi = {
  internal: Endpoint.multi({
    children: {
      driver: Endpoint.multi({
        children: {
          runs: Endpoint.multi({
            children: {
              ":runId": Endpoint.multi({
                children: {
                  logs: authenticatedDriverPostEndpoint.input(
                    driverLogEventSchema,
                  ),
                  lifecycle: authenticatedDriverPostEndpoint.input(
                    driverLifecycleEventSchema,
                  ),
                },
              }),
            },
          }),
        },
      }),
    },
  }),
};

export type DriverApi = typeof driverApi;
export type DriverApiClient = ClientsForApi<DriverApi>;
export type DriverApiPostResponse = FetchClientResult<
  typeof authenticatedDriverPostEndpoint
>;

export function createDriverApiClient(baseUrl: string): DriverApiClient {
  return createClientsFromApi(driverApi, ["api"], baseUrl);
}
