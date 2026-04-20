import type { ProjectShortCode, TaskId } from "@mono/api";
import { describe, expect, it } from "vitest";
import {
  buildTaskBranchName,
  slugifyTaskTitle,
  taskIdToNumericString,
} from "./task-branch-name";

describe("taskIdToNumericString", () => {
  it("converts a UUID task id to a decimal string", () => {
    expect(
      taskIdToNumericString("019daa8a-d02a-7b5f-bd10-be06079e3780" as TaskId),
    ).toMatch(/^\d+$/);
  });

  it("handles non-UUID ids deterministically", () => {
    expect(taskIdToNumericString("task-1" as TaskId)).toMatch(/^\d+$/);
  });
});

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
  it("joins short code, numeric id, and title slug", () => {
    const branch = buildTaskBranchName("TST" as ProjectShortCode, {
      id: "019daa8a-d02a-7b5f-bd10-be06079e3780" as TaskId,
      title: "Update branch naming",
    });
    expect(branch).toMatch(/^tst-\d+-update-branch-naming$/);
  });
});
