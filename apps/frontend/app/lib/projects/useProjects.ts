import type {
  CreateProjectRequest,
  ProjectId,
  UpdateProjectRequest,
  WorkspaceId,
} from "@mono/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "~/lib/api-client";
import type { Project } from "~/types";

//
// These hooks are expected to be private to the projects directory
//

const projectsQueryKey = (workspaceId: WorkspaceId | null) =>
  ["projects", workspaceId] as const;

/**
 * Hook to fetch all projects for a workspace.
 */
export function useProjectsQuery(workspaceId: WorkspaceId | null) {
  return useQuery({
    queryKey: projectsQueryKey(workspaceId),
    queryFn: async (): Promise<Project[]> => {
      if (!workspaceId) throw new Error("Workspace ID is required");
      const response = await apiClient.workspaces[":workspaceId"].projects.GET({
        pathParams: { workspaceId },
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      throw new Error("Failed to fetch projects");
    },
    enabled: workspaceId !== null,
  });
}

/**
 * Hook to create a new project.
 */
export function useCreateProject(workspaceId: WorkspaceId | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      createProjectRequest: CreateProjectRequest,
    ): Promise<Project> => {
      if (!workspaceId) throw new Error("Workspace ID is required");
      const response = await apiClient.workspaces[":workspaceId"].projects.POST(
        {
          pathParams: { workspaceId },
          body: createProjectRequest,
        },
      );
      if (response.status === 200) {
        return response.responseBody;
      }
      throw new Error("Failed to create project");
    },
    onSuccess: (newProject) => {
      if (workspaceId) {
        queryClient.setQueryData<Project[]>(
          projectsQueryKey(workspaceId),
          (old) => {
            if (!old) return [newProject];
            return [...old, newProject];
          },
        );
      }
    },
  });
}

export function useUpdateProject(workspaceId: WorkspaceId | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      updateProjectRequest,
    }: {
      projectId: ProjectId;
      updateProjectRequest: UpdateProjectRequest;
    }): Promise<Project> => {
      if (!workspaceId) throw new Error("Workspace ID is required");
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].PATCH({
        pathParams: { workspaceId, projectId },
        body: updateProjectRequest,
      });
      if (response.status === 200) {
        return response.responseBody as Project;
      }
      if (response.status === 404) {
        throw new Error("Project not found");
      }
      throw new Error("Failed to update project");
    },
    onSuccess: (updatedProject) => {
      if (workspaceId) {
        queryClient.setQueryData<Project[]>(
          projectsQueryKey(workspaceId),
          (old) => {
            if (!old) return [updatedProject];
            return old.map((p) =>
              p.id === updatedProject.id ? updatedProject : p,
            );
          },
        );
      }
    },
  });
}

/**
 * Hook to start a run for a project.
 */
export function useStartRun(workspaceId: WorkspaceId | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      mode,
    }: {
      projectId: ProjectId;
      mode: "single" | "loop";
    }): Promise<{ runId: string; project: Project }> => {
      if (!workspaceId) throw new Error("Workspace ID is required");
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].run.POST({
        pathParams: { workspaceId, projectId },
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
      if (workspaceId) {
        const updatedProject = result.project;
        queryClient.setQueryData<Project[]>(
          projectsQueryKey(workspaceId),
          (old) => {
            if (!old) return [updatedProject];
            return old.map((p) =>
              p.id === updatedProject.id ? updatedProject : p,
            );
          },
        );
      }
    },
    onError: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: projectsQueryKey(workspaceId),
        });
      }
    },
  });
}

/**
 * Hook to stop the queue for a project.
 */
export function useStopQueue(workspaceId: WorkspaceId | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      stopImmediately,
    }: {
      projectId: ProjectId;
      stopImmediately: boolean;
    }): Promise<{ project: Project }> => {
      if (!workspaceId) throw new Error("Workspace ID is required");
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].stop.POST({
        pathParams: { workspaceId, projectId },
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
      if (workspaceId) {
        const updatedProject = result.project;
        queryClient.setQueryData<Project[]>(
          projectsQueryKey(workspaceId),
          (old) => {
            if (!old) return [updatedProject];
            return old.map((p) =>
              p.id === updatedProject.id ? updatedProject : p,
            );
          },
        );
      }
    },
    onError: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: projectsQueryKey(workspaceId),
        });
      }
    },
  });
}

/**
 * Hook to test forge connection using credentials provided in the request
 * (e.g. from the project dialog form). Use this to validate credentials
 * before saving; does not rely on server-stored project state.
 */
export function useTestForgeConnectionWithCredentials(
  workspaceId: WorkspaceId | null,
) {
  return useMutation({
    mutationFn: async (params: {
      forgeType: "gitlab" | "github";
      forgeBaseUrl: string;
      forgeToken: string;
      repositoryUrl: string;
    }): Promise<{ success: true } | { success: false; error: string }> => {
      if (!workspaceId) throw new Error("Workspace ID is required");
      const response = await apiClient.workspaces[":workspaceId"].projects[
        "test-forge-connection"
      ].POST({
        pathParams: { workspaceId },
        body: params,
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 400) {
        return response.responseBody;
      }
      throw new Error("Failed to test forge connection");
    },
  });
}
