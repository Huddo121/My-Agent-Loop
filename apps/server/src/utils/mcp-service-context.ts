import { AsyncLocalStorage } from "node:async_hooks";
import type { Services } from "../services";

const mcpServicesContext = new AsyncLocalStorage<Services>();

// biome-ignore lint/style/noNonNullAssertion: If this fails at runtime, the app should explode
export const getMcpServices = () => mcpServicesContext.getStore()!;

export const withMcpServices = async <T>(
  services: Services,
  fn: () => Promise<T>,
): Promise<T> => {
  return mcpServicesContext.run(services, () => fn());
};
