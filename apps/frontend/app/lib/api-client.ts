import { myAgentLoopApi } from "@mono/api";
import { createClientsFromApi } from "cerato";

/**
 * API client for the My Agent Loop backend.
 * Uses cerato to provide end-to-end typesafe API calls.
 */
export const apiClient = createClientsFromApi(myAgentLoopApi, ["api"]);
