import { describe, expect, it } from "vitest";
import type { RunId } from "../../runs/RunId";
import { InMemoryDriverRunTokenStore } from "../DriverRunTokenStore";

describe("InMemoryDriverRunTokenStore", () => {
  it("matches stored tokens using plain string equality", () => {
    const store = new InMemoryDriverRunTokenStore();
    const runId = "run-1" as RunId;

    store.setToken(runId, "driver-secret-token");

    expect(store.isValidToken(runId, "driver-secret-token")).toBe(true);
    expect(store.isValidToken(runId, "driver-secret-token-2")).toBe(false);
  });

  it("stops accepting a token after it is cleared", () => {
    const store = new InMemoryDriverRunTokenStore();
    const runId = "run-1" as RunId;

    store.setToken(runId, "driver-secret-token");
    store.clearToken(runId);

    expect(store.isValidToken(runId, "driver-secret-token")).toBe(false);
  });
});
