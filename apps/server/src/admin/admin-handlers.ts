import { type MyAgentLoopApi, unauthenticated } from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import type { Services } from "../services";

export const adminHandlers: HonoHandlersFor<
  ["admin"],
  MyAgentLoopApi["admin"],
  Services
> = {
  GET: async () => unauthenticated("Admin access is not available yet."),
  "clear-queue": async () =>
    unauthenticated("Admin access is not available yet."),
};
