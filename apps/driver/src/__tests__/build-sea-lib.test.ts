import { describe, expect, it, vi } from "vitest";
import {
  handleSeaInjectionFailure,
  isSeaInjectionRequired,
} from "../../build-sea-lib.mjs";

describe("build-sea helpers", () => {
  it("requires injection only when explicitly configured", () => {
    expect(isSeaInjectionRequired({})).toBe(false);
    expect(isSeaInjectionRequired({ DRIVER_SEA_INJECTION_REQUIRED: "0" })).toBe(
      false,
    );
    expect(isSeaInjectionRequired({ DRIVER_SEA_INJECTION_REQUIRED: "1" })).toBe(
      true,
    );
  });

  it("throws when a required injection fails", () => {
    expect(() =>
      handleSeaInjectionFailure({
        bundleFile: "dist-sea/index.cjs",
        seaBlobFile: "dist-sea/sea-blob.blob",
        seaExeFile: "dist-sea/driver",
        error: new Error("missing sentinel"),
        injectionRequired: true,
      }),
    ).toThrowError(/Failed to inject SEA blob into executable/);
  });

  it("keeps the softer warning path for optional local builds", () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(() =>
      handleSeaInjectionFailure({
        bundleFile: "dist-sea/index.cjs",
        seaBlobFile: "dist-sea/sea-blob.blob",
        seaExeFile: "dist-sea/driver",
        error: new Error("missing sentinel"),
        injectionRequired: false,
      }),
    ).not.toThrow();

    expect(consoleLogSpy).toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });
});
