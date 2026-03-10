import { type MyAgentLoopApi, myAgentLoopApi } from "@mono/api";
import { type ClientsForApi, createClientsFromApi } from "cerato";

/**
 * API client for the My Agent Loop backend.
 * Uses cerato to provide end-to-end typesafe API calls.
 */
export const apiClient: ClientsForApi<MyAgentLoopApi> = createClientsFromApi(
  myAgentLoopApi,
  ["api"],
);
