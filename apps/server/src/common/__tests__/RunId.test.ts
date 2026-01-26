import { describe, expect, it } from "vitest";
import { generateRunId } from "../../runs/RunId";

describe("RunId", () => {
  describe("generateRunId", () => {
    it("should generate an ID of exactly 16 characters", () => {
      const runId = generateRunId();
      expect(runId).toHaveLength(16);
    });

    it("should generate IDs using only lowercase letters and numbers", () => {
      const runId = generateRunId();
      const validChars = /^[abcdefghijklmnopqrstuvwxyz0123456789]+$/;
      expect(runId).toMatch(validChars);
    });

    it("should generate different IDs on multiple calls", () => {
      const runId1 = generateRunId();
      const runId2 = generateRunId();
      expect(runId1).not.toBe(runId2);
    });

    it("should generate a string", () => {
      const runId = generateRunId();
      expect(typeof runId).toBe("string");
    });
  });
});
