import type { ProjectShortCode, TaskNumber } from "@mono/api";
import { describe, expect, it } from "vitest";
import { buildTaskBranchName, slugifyTaskTitle } from "./task-branch-name";

describe("slugifyTaskTitle", () => {
  it("lowercases, replaces non-alphanumerics with dashes, and trims", () => {
    expect(slugifyTaskTitle("Fix the API!!!")).toBe("fix-the-api");
  });

  it("strips combining marks after NFKD normalization", () => {
    expect(slugifyTaskTitle("Café René")).toBe("cafe-rene");
  });

  it("uses a fallback when the title has no alphanumeric characters", () => {
    expect(slugifyTaskTitle("!!!")).toBe("task");
  });
});

describe("buildTaskBranchName", () => {
  it("joins short code, task number, and title slug", () => {
    const branch = buildTaskBranchName("TST" as ProjectShortCode, {
      taskNumber: 42 as TaskNumber,
      title: "Update branch naming",
    });
    expect(branch).toBe("tst-42-update-branch-naming");
  });
});
