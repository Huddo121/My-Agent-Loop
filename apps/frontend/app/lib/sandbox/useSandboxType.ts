import type {
  ProjectId,
  SandboxTypeConfigResponse,
  SetSandboxTypeRequest,
  WorkspaceId,
} from "@mono/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "~/lib/api-client";
import { handleUnauthenticated } from "~/lib/auth/api-errors";

//
// Query key hierarchy mirrors the URL hierarchy so invalidating a parent key
// automatically invalidates all child sandbox-type queries.
//
const workspaceSandboxTypeQueryKey = (workspaceId: WorkspaceId) =>
  ["workspaces", workspaceId, "sandbox-type"] as const;

const projectSandboxTypeQueryKey = (
  workspaceId: WorkspaceId,
  projectId: ProjectId,
) =>
  ["workspaces", workspaceId, "projects", projectId, "sandbox-type"] as const;

/**
 * Query for the sandbox type configured on a workspace.
 * null means the server default (docker) applies.
 */
export function useWorkspaceSandboxTypeQuery(workspaceId: WorkspaceId) {
  return useQuery({
    queryKey: workspaceSandboxTypeQueryKey(workspaceId),
    queryFn: async (): Promise<SandboxTypeConfigResponse> => {
      const response = await apiClient.workspaces[":workspaceId"][
        "sandbox-type"
      ].GET({ pathParams: { workspaceId } });
      if (response.status === 200) return response.responseBody;
      if (response.status === 401) return handleUnauthenticated();
      if (response.status === 404) throw new Error("Workspace not found");
      throw new Error("Failed to fetch workspace sandbox type");
    },
  });
}

/**
 * Mutation to set the sandbox type on a workspace.
 * Pass sandboxType: null to clear the override and fall back to the server default.
 */
export function useSetWorkspaceSandboxType(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      request: SetSandboxTypeRequest,
    ): Promise<SandboxTypeConfigResponse> => {
      const response = await apiClient.workspaces[":workspaceId"][
        "sandbox-type"
      ].PUT({ pathParams: { workspaceId }, body: request });
      if (response.status === 200) return response.responseBody;
      if (response.status === 401) return handleUnauthenticated();
      if (response.status === 400)
        throw new Error(response.responseBody.message);
      if (response.status === 404) throw new Error("Workspace not found");
      throw new Error("Failed to set workspace sandbox type");
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<SandboxTypeConfigResponse>(
        workspaceSandboxTypeQueryKey(workspaceId),
        updated,
      );
    },
  });
}

/**
 * Query for the sandbox type configured on a project.
 * null means inherit from the workspace (which may itself fall back to the server default).
 */
export function useProjectSandboxTypeQuery(
  workspaceId: WorkspaceId,
  projectId: ProjectId,
) {
  return useQuery({
    queryKey: projectSandboxTypeQueryKey(workspaceId, projectId),
    queryFn: async (): Promise<SandboxTypeConfigResponse> => {
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ]["sandbox-type"].GET({ pathParams: { workspaceId, projectId } });
      if (response.status === 200) return response.responseBody;
      if (response.status === 401) return handleUnauthenticated();
      if (response.status === 404) throw new Error("Project not found");
      throw new Error("Failed to fetch project sandbox type");
    },
  });
}

/**
 * Mutation to set the sandbox type on a project.
 * Pass sandboxType: null to clear the project override and inherit from the workspace.
 */
export function useSetProjectSandboxType(
  workspaceId: WorkspaceId,
  projectId: ProjectId,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      request: SetSandboxTypeRequest,
    ): Promise<SandboxTypeConfigResponse> => {
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ]["sandbox-type"].PUT({
        pathParams: { workspaceId, projectId },
        body: request,
      });
      if (response.status === 200) return response.responseBody;
      if (response.status === 401) return handleUnauthenticated();
      if (response.status === 400)
        throw new Error(response.responseBody.message);
      if (response.status === 404) throw new Error("Project not found");
      throw new Error("Failed to set project sandbox type");
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<SandboxTypeConfigResponse>(
        projectSandboxTypeQueryKey(workspaceId, projectId),
        updated,
      );
    },
  });
}
