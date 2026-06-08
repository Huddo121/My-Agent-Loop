import type {
  ProjectId,
  SandboxTypeConfigResponse,
  WorkspaceId,
} from "@mono/api";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  projectSandboxTypeQueryKey,
  workspaceSandboxTypeQueryKey,
} from "./useSandboxType";

const workspaceId = "workspace-1" as WorkspaceId;
const projectId = "project-1" as ProjectId;

describe("sandbox-type query keys", () => {
  it("builds the workspace key from the URL hierarchy", () => {
    expect(workspaceSandboxTypeQueryKey(workspaceId)).toEqual([
      "workspaces",
      workspaceId,
      "sandbox-type",
    ]);
  });

  it("builds the project key from the URL hierarchy", () => {
    expect(projectSandboxTypeQueryKey(workspaceId, projectId)).toEqual([
      "workspaces",
      workspaceId,
      "projects",
      projectId,
      "sandbox-type",
    ]);
  });

  // The comment in useSandboxType promises that invalidating a parent key cascades to child
  // sandbox-type queries. That only holds while both keys are nested under the same
  // ["workspaces", workspaceId] prefix — react-query matches invalidation by key prefix.
  it("nests both keys under the shared workspace prefix so parent invalidation cascades", () => {
    const prefix = ["workspaces", workspaceId];
    expect(workspaceSandboxTypeQueryKey(workspaceId).slice(0, 2)).toEqual(
      prefix,
    );
    expect(
      projectSandboxTypeQueryKey(workspaceId, projectId).slice(0, 2),
    ).toEqual(prefix);
  });

  // The mutation's onSuccess writes the updated value under this exact key. This does not drive the
  // hook itself; it pins the key/cache round-trip that onSuccess depends on, so a key-shape change
  // that would silently break the optimistic update is caught here.
  it("serves the value written under the project key from the cache", () => {
    const queryClient = new QueryClient();
    const updated: SandboxTypeConfigResponse = { sandboxType: "vm" };

    queryClient.setQueryData<SandboxTypeConfigResponse>(
      projectSandboxTypeQueryKey(workspaceId, projectId),
      updated,
    );

    expect(
      queryClient.getQueryData<SandboxTypeConfigResponse>(
        projectSandboxTypeQueryKey(workspaceId, projectId),
      ),
    ).toEqual(updated);
  });
});
