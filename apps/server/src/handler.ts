import type { AnyApi, HonoHandlersFor, PathParts } from "cerato";
import type { Services } from "./services";

export type Handler<
  T extends AnyApi,
  ParentPath extends PathParts = [],
> = HonoHandlersFor<ParentPath, T, Services>;
