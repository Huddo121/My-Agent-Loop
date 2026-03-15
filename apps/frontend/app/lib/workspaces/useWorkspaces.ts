import type { UpdateWorkspaceRequest, WorkspaceId } from "@mono/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "~/lib/api-client";
import { handleUnauthenticated } from "~/lib/auth/api-errors";
import type { Workspace } from "~/types";

const WORKSPACES_QUERY_KEY = ["workspaces"] as const;
const WORKSPACE_QUERY_KEY = (workspaceId: WorkspaceId) =>
  [...WORKSPACES_QUERY_KEY, workspaceId] as const;
const WORKSPACE_HARNESES_QUERY_KEY = (workspaceId: WorkspaceId) =>
  [...WORKSPACE_QUERY_KEY(workspaceId), "harnesses"] as const;

/**
 * Hook to fetch all workspaces.
 */
export function useWorkspacesQuery() {
  return useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: async (): Promise<Workspace[]> => {
      const response = await apiClient.workspaces.GET();
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 401) {
        return handleUnauthenticated();
      }
      throw new Error("Failed to fetch workspaces");
    },
  });
}

/**
 * Hook to fetch a single workspace by id.
 */
export function useWorkspaceQuery(workspaceId: WorkspaceId) {
  return useQuery({
    queryKey: [...WORKSPACES_QUERY_KEY, workspaceId] as const,
    queryFn: async (): Promise<Workspace | null> => {
      const response = await apiClient.workspaces[":workspaceId"].GET({
        pathParams: { workspaceId },
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 401) {
        return handleUnauthenticated();
      }
      if (response.status === 404) return null;
      throw new Error("Failed to fetch workspace");
    },
  });
}

/**
 * Hook to fetch available harnesses for a workspace (with auth status).
 * Only call when workspaceId is defined; handle null at the call site.
 */
export function useHarnessesQuery(workspaceId: WorkspaceId) {
  return useQuery({
    queryKey: WORKSPACE_HARNESES_QUERY_KEY(workspaceId),
    queryFn: async () => {
      const response = await apiClient.workspaces[":workspaceId"].harnesses.GET(
        {
          pathParams: { workspaceId },
        },
      );
      if (response.status === 200) return response.responseBody;
      if (response.status === 401) {
        return handleUnauthenticated();
      }
      if (response.status === 404) {
        throw new Error("Workspace not found");
      }
      throw new Error("Failed to fetch harnesses");
    },
  });
}

/**
 * Hook to update a workspace (name and/or default agent harness).
 * Only call when workspaceId is defined; handle null at the call site.
 */
export function useUpdateWorkspace(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: UpdateWorkspaceRequest): Promise<Workspace> => {
      const response = await apiClient.workspaces[":workspaceId"].PATCH({
        pathParams: { workspaceId },
        body: request,
      });
      if (response.status === 200) return response.responseBody;
      if (response.status === 401) {
        return handleUnauthenticated();
      }
      if (response.status === 400) {
        throw new Error(response.responseBody.message);
      }
      if (response.status === 404) throw new Error("Workspace not found");
      throw new Error("Failed to update workspace");
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Workspace | null>(
        WORKSPACE_QUERY_KEY(workspaceId),
        updated,
      );
      queryClient.setQueryData<Workspace[]>(WORKSPACES_QUERY_KEY, (old) => {
        if (!old) return [updated];
        return old.map((w) => (w.id === updated.id ? updated : w));
      });
    },
  });
}
