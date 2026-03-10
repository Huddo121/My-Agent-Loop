import type {
  CreateProjectRequest,
  ProjectId,
  UpdateProjectRequest,
  WorkspaceId,
} from "@mono/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "~/lib/api-client";
import { useCurrentWorkspace } from "~/lib/workspaces";
import type { Project } from "~/types";

//
// These hooks are expected to be private to the projects directory.
// They must be used inside CurrentWorkspaceProvider (e.g. on app routes after the setup gate).
//

const projectsQueryKey = (workspaceId: WorkspaceId) =>
  ["projects", workspaceId] as const;

/**
 * Hook to fetch all projects for the current workspace.
 */
export function useProjectsQuery() {
  const workspace = useCurrentWorkspace();
  return useQuery({
    queryKey: projectsQueryKey(workspace.id),
    queryFn: async (): Promise<Project[]> => {
      const response = await apiClient.workspaces[":workspaceId"].projects.GET({
        pathParams: { workspaceId: workspace.id },
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      throw new Error("Failed to fetch projects");
    },
  });
}

/**
 * Hook to create a new project in the current workspace.
 */
export function useCreateProject() {
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();

  return useMutation({
    mutationFn: async (
      createProjectRequest: CreateProjectRequest,
    ): Promise<Project> => {
      const response = await apiClient.workspaces[":workspaceId"].projects.POST(
        {
          pathParams: { workspaceId: workspace.id },
          body: createProjectRequest,
        },
      );
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 400) {
        throw new Error(response.responseBody.message);
      }
      throw new Error("Failed to create project");
    },
    onSuccess: (newProject) => {
      queryClient.setQueryData<Project[]>(
        projectsQueryKey(workspace.id),
        (old) => {
          if (!old) return [newProject];
          return [...old, newProject];
        },
      );
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();

  return useMutation({
    mutationFn: async ({
      projectId,
      updateProjectRequest,
    }: {
      projectId: ProjectId;
      updateProjectRequest: UpdateProjectRequest;
    }): Promise<Project> => {
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].PATCH({
        pathParams: { workspaceId: workspace.id, projectId },
        body: updateProjectRequest,
      });
      if (response.status === 200) {
        return response.responseBody as Project;
      }
      if (response.status === 400) {
        throw new Error(response.responseBody.message);
      }
      if (response.status === 404) {
        throw new Error("Project not found");
      }
      throw new Error("Failed to update project");
    },
    onSuccess: (updatedProject) => {
      queryClient.setQueryData<Project[]>(
        projectsQueryKey(workspace.id),
        (old) => {
          if (!old) return [updatedProject];
          return old.map((p) =>
            p.id === updatedProject.id ? updatedProject : p,
          );
        },
      );
    },
  });
}

/**
 * Hook to start a run for a project.
 */
export function useStartRun() {
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();

  return useMutation({
    mutationFn: async ({
      projectId,
      mode,
    }: {
      projectId: ProjectId;
      mode: "single" | "loop";
    }): Promise<{ runId: string; project: Project }> => {
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].run.POST({
        pathParams: { workspaceId: workspace.id, projectId },
        body: { mode },
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 404) {
        throw new Error("Project not found or no tasks available");
      }
      throw new Error("Failed to start run");
    },
    onSuccess: (result) => {
      const updatedProject = result.project;
      queryClient.setQueryData<Project[]>(
        projectsQueryKey(workspace.id),
        (old) => {
          if (!old) return [updatedProject];
          return old.map((p) =>
            p.id === updatedProject.id ? updatedProject : p,
          );
        },
      );
    },
    onError: () => {
      queryClient.invalidateQueries({
        queryKey: projectsQueryKey(workspace.id),
      });
    },
  });
}

/**
 * Hook to stop the queue for a project.
 */
export function useStopQueue() {
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();

  return useMutation({
    mutationFn: async ({
      projectId,
      stopImmediately,
    }: {
      projectId: ProjectId;
      stopImmediately: boolean;
    }): Promise<{ project: Project }> => {
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].stop.POST({
        pathParams: { workspaceId: workspace.id, projectId },
        body: { stopImmediately },
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 404) {
        throw new Error("Project not found");
      }
      if (response.status === 400) {
        throw new Error("Queue is not in a running state");
      }
      throw new Error("Failed to stop queue");
    },
    onSuccess: (result) => {
      const updatedProject = result.project;
      queryClient.setQueryData<Project[]>(
        projectsQueryKey(workspace.id),
        (old) => {
          if (!old) return [updatedProject];
          return old.map((p) =>
            p.id === updatedProject.id ? updatedProject : p,
          );
        },
      );
    },
    onError: () => {
      queryClient.invalidateQueries({
        queryKey: projectsQueryKey(workspace.id),
      });
    },
  });
}

/**
 * Hook to test forge connection using credentials provided in the request
 * (e.g. from the project dialog form). Use this to validate credentials
 * before saving; does not rely on server-stored project state.
 */
export function useTestForgeConnectionWithCredentials() {
  const workspace = useCurrentWorkspace();

  return useMutation({
    mutationFn: async (params: {
      forgeType: "gitlab" | "github";
      forgeBaseUrl: string;
      forgeToken: string;
      repositoryUrl: string;
    }): Promise<{ success: true } | { success: false; error: string }> => {
      const response = await apiClient.workspaces[":workspaceId"].projects[
        "test-forge-connection"
      ].POST({
        pathParams: { workspaceId: workspace.id },
        body: params,
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 400) {
        return {
          success: false as const,
          error: response.responseBody.message,
        };
      }
      throw new Error("Failed to test forge connection");
    },
  });
}
