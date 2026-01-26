import type { ProjectId, ProjectShortCode } from "@mono/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "~/lib/api-client";
import type { Project } from "~/types";

const PROJECTS_QUERY_KEY = ["projects"] as const;

/**
 * Hook to fetch all projects.
 */
export function useProjects() {
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
    mutationFn: async ({
      name,
      shortCode,
      repositoryUrl,
    }: {
      name: string;
      shortCode: ProjectShortCode;
      repositoryUrl: string;
    }): Promise<Project> => {
      const response = await apiClient.projects.POST({
        body: { name, shortCode, repositoryUrl },
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

/**
 * Hook to rename an existing project.
 */
export function useRenameProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      name,
      shortCode,
      repositoryUrl,
    }: {
      projectId: ProjectId;
      name: string;
      shortCode: ProjectShortCode;
      repositoryUrl: string;
    }): Promise<Project> => {
      const response = await apiClient.projects[":projectId"].PATCH({
        pathParams: { projectId },
        body: { name, shortCode, repositoryUrl },
      });
      if (response.status === 200) {
        return response.responseBody as Project;
      }
      if (response.status === 404) {
        throw new Error("Project not found");
      }
      throw new Error("Failed to rename project");
    },
    onSuccess: (updatedProject) => {
      // Update the projects cache with the renamed project
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
  return useMutation({
    mutationFn: async ({
      projectId,
      mode,
    }: {
      projectId: ProjectId;
      mode: "single" | "loop";
    }): Promise<{ runId: string }> => {
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
  });
}
