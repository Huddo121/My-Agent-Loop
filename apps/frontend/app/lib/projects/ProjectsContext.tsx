import type { ProjectId } from "@mono/api";
import { createContext, useContext, useMemo } from "react";
import { create } from "zustand";
import {
  useCreateProject,
  useProjectsQuery,
  useStartRun,
  useUpdateProject,
} from "~/lib/projects/useProjects";
import type { Project } from "~/types";

/**
 * Client-side state related to projects.
 *
 * Zustand stores should ONLY be used to hold state related to the UI,
 *   it shouldn't be used as another cache of data that we've fetched
 *   from the backend.
 */
interface ProjectsStore {
  currentProjectId: ProjectId | null;
  selectProject: (projectId: ProjectId) => void;
}

export const useProjectsStore = create<ProjectsStore>((set) => ({
  currentProjectId: null,
  selectProject: (projectId: ProjectId) => set({ currentProjectId: projectId }),
}));

export interface ProjectsContextValue {
  /** Current project id being used/interacted with */
  currentProjectId: ProjectId | null;

  /** Current project being used/interacted with */
  currentProject: Project | null;

  /** Full projects list when provider is given projectId. */
  projects: Project[];

  /** Whether projects are loading */
  isLoadingProjects: boolean;

  /** Store: set the current project. */
  selectProject: (projectId: ProjectId) => void;

  createProject: ReturnType<typeof useCreateProject>;

  updateProject: ReturnType<typeof useUpdateProject>;

  startRun: ReturnType<typeof useStartRun>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export interface ProjectsProviderProps {
  children: React.ReactNode;
  /**
   * When provided, the provider fetches projects and exposes selectedProject,
   * projects, and isLoadingProjects derived from this id (e.g. from route params).
   */
  projectId?: ProjectId;
}

export function ProjectsProvider({
  children,
  projectId,
}: ProjectsProviderProps) {
  const currentProjectId = useProjectsStore((s) => s.currentProjectId);
  const selectProject = useProjectsStore((s) => s.selectProject);

  const { data: projects = [], isLoading: isLoadingProjects } =
    useProjectsQuery();

  const selectedProject = useMemo(
    () =>
      projectId ? (projects.find((p) => p.id === projectId) ?? null) : null,
    [projectId, projects],
  );

  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const startRun = useStartRun();

  const value: ProjectsContextValue = useMemo(
    () => ({
      currentProjectId: projectId ?? currentProjectId,
      currentProject: selectedProject,
      projects,
      isLoadingProjects,
      selectProject,
      createProject,
      updateProject,
      startRun,
    }),
    [
      projectId,
      currentProjectId,
      selectedProject,
      projects,
      isLoadingProjects,
      selectProject,
      createProject,
      updateProject,
      startRun,
    ],
  );

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjectsContext(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (ctx === null) {
    throw new Error(
      "useProjectsContext must be used within a ProjectsProvider",
    );
  }
  return ctx;
}
