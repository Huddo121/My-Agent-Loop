import type { AppSessionResponse, BootstrapWorkspaceRequest } from "@mono/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "~/types";
import { apiClient } from "../api-client";
import { handleUnauthenticated } from "./api-errors";
import { authClient } from "./auth-client";

export const APP_SESSION_QUERY_KEY = ["session"] as const;
const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

export function useMagicLinkSignIn() {
  return useMutation({
    mutationFn: async ({
      email,
      callbackURL,
    }: {
      email: string;
      callbackURL: string;
    }) => {
      await authClient.signIn.magicLink({
        email,
        callbackURL,
      });
    },
  });
}

export function useAppSessionQuery(enabled: boolean) {
  return useQuery({
    queryKey: APP_SESSION_QUERY_KEY,
    enabled,
    queryFn: async (): Promise<AppSessionResponse> => {
      const response = await apiClient.session.GET();
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 401) {
        return handleUnauthenticated();
      }
      throw new Error("Failed to fetch session");
    },
  });
}

export function useBootstrapWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      request: BootstrapWorkspaceRequest,
    ): Promise<Workspace> => {
      const response = await apiClient.session["bootstrap-workspace"].POST({
        body: request,
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 400) {
        throw new Error(response.responseBody.message);
      }
      if (response.status === 401) {
        return handleUnauthenticated();
      }
      throw new Error("Failed to create workspace");
    },
    onSuccess: (workspace) => {
      queryClient.setQueryData<Workspace[]>(WORKSPACES_QUERY_KEY, [workspace]);
      queryClient.invalidateQueries({ queryKey: APP_SESSION_QUERY_KEY });
    },
  });
}
