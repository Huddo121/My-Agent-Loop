import { describe, expect, it } from "vitest";
import {
  createProjectRequestSchema,
  testForgeConnectionRequestSchema,
} from "./projects-api";

const validProject = {
  name: "Project",
  shortCode: "PRJ",
  repositoryUrl: "https://github.com/owner/repo.git",
  workflowConfiguration: {
    version: "1" as const,
    onTaskCompleted: "push-branch" as const,
  },
  forgeType: "github" as const,
  forgeBaseUrl: "https://github.com",
  forgeToken: "token",
};

describe("repository access URL validation", () => {
  it("accepts HTTPS repository and hosting URLs", () => {
    expect(createProjectRequestSchema.safeParse(validProject).success).toBe(
      true,
    );
  });

  it("rejects SSH repository URLs", () => {
    expect(
      createProjectRequestSchema.safeParse({
        ...validProject,
        repositoryUrl: "git@github.com:owner/repo.git",
      }).success,
    ).toBe(false);
  });

  it("rejects a repository URL without an owner and repository path", () => {
    expect(
      createProjectRequestSchema.safeParse({
        ...validProject,
        repositoryUrl: "https://github.com",
      }).success,
    ).toBe(false);
  });

  it("rejects non-HTTPS hosting URLs when testing a connection", () => {
    expect(
      testForgeConnectionRequestSchema.safeParse({
        ...validProject,
        forgeBaseUrl: "http://github.example.com",
      }).success,
    ).toBe(false);
  });
});
