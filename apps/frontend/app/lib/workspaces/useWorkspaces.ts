import type { CreateWorkspaceRequest, WorkspaceId } from "@mono/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "~/lib/api-client";
import type { Workspace } from "~/types";

const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

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
      throw new Error("Failed to fetch workspaces");
    },
  });
}

/**
 * Hook to create a new workspace.
 */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateWorkspaceRequest): Promise<Workspace> => {
      const response = await apiClient.workspaces.POST({
        body: request,
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      throw new Error("Failed to create workspace");
    },
    onSuccess: (newWorkspace) => {
      queryClient.setQueryData<Workspace[]>(WORKSPACES_QUERY_KEY, (old) => {
        if (!old) return [newWorkspace];
        return [...old, newWorkspace];
      });
    },
  });
}

/**
 * Hook to fetch a single workspace by id.
 */
export function useWorkspaceQuery(workspaceId: WorkspaceId | null) {
  return useQuery({
    queryKey: [...WORKSPACES_QUERY_KEY, workspaceId] as const,
    queryFn: async (): Promise<Workspace | null> => {
      if (!workspaceId) return null;
      const response = await apiClient.workspaces[":workspaceId"].GET({
        pathParams: { workspaceId },
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 404) return null;
      throw new Error("Failed to fetch workspace");
    },
    enabled: workspaceId !== null,
  });
}
