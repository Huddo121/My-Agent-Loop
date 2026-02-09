import type {
  CreateProjectRequest,
  ProjectId,
  UpdateProjectRequest,
} from "@mono/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "~/lib/api-client";
import type { Project } from "~/types";

//
// These hooks are expected to be private to the projects directory
//

const PROJECTS_QUERY_KEY = ["projects"] as const;

/**
 * Hook to fetch all projects.
 */
export function useProjectsQuery() {
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: async (): Promise<Project[]> => {
      const response = await apiClient.projects.GET();
      if (response.status === 200) {
        return response.responseBody;
      }
      throw new Error("Failed to fetch projects");
    },
  });
}

/**
 * Hook to create a new project.
 */
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      createProjectRequest: CreateProjectRequest,
    ): Promise<Project> => {
      const response = await apiClient.projects.POST({
        body: createProjectRequest,
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      throw new Error("Failed to create project");
    },
    onSuccess: (newProject) => {
      // Update the projects cache with the new project
      queryClient.setQueryData<Project[]>(PROJECTS_QUERY_KEY, (old) => {
        if (!old) return [newProject];
        return [...old, newProject];
      });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      updateProjectRequest,
    }: {
      projectId: ProjectId;
      updateProjectRequest: UpdateProjectRequest;
    }): Promise<Project> => {
      const response = await apiClient.projects[":projectId"].PATCH({
        pathParams: { projectId },
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
      // Update the projects cache with the updated project
      queryClient.setQueryData<Project[]>(PROJECTS_QUERY_KEY, (old) => {
        if (!old) return [updatedProject];
        return old.map((p) =>
          p.id === updatedProject.id ? updatedProject : p,
        );
      });
    },
  });
}

/**
 * Hook to start a run for a project.
 */
export function useStartRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      mode,
    }: {
      projectId: ProjectId;
      mode: "single" | "loop";
    }): Promise<{ runId: string; project: Project }> => {
      const response = await apiClient.projects[":projectId"].run.POST({
        pathParams: { projectId },
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
      // Update the cache with the project returned from the server
      const updatedProject = result.project;
      queryClient.setQueryData<Project[]>(PROJECTS_QUERY_KEY, (old) => {
        if (!old) return [updatedProject];
        return old.map((p) =>
          p.id === updatedProject.id ? updatedProject : p,
        );
      });
    },
    onError: () => {
      // On error, invalidate to refetch and get the real state
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
}

/**
 * Hook to stop the queue for a project.
 */
export function useStopQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      stopImmediately,
    }: {
      projectId: ProjectId;
      stopImmediately: boolean;
    }): Promise<{ project: Project }> => {
      const response = await apiClient.projects[":projectId"].stop.POST({
        pathParams: { projectId },
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
      // Update the cache with the project returned from the server
      const updatedProject = result.project;
      queryClient.setQueryData<Project[]>(PROJECTS_QUERY_KEY, (old) => {
        if (!old) return [updatedProject];
        return old.map((p) =>
          p.id === updatedProject.id ? updatedProject : p,
        );
      });
    },
    onError: () => {
      // On error, invalidate to refetch and get the real state
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
}
