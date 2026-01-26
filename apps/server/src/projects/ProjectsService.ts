import type { ProjectId, ProjectShortCode } from "@mono/api";

export interface Project {
  id: ProjectId;
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
}

export interface ProjectsService {
  getAllProjects(): Promise<Project[]>;
  getProject(projectId: ProjectId): Promise<Project | undefined>;
  getProjectByShortCode(
    shortCode: ProjectShortCode,
  ): Promise<Project | undefined>;
  createProject(project: Project): Promise<Project>;
  updateProject(project: Project): Promise<Project | undefined>;
  deleteProject(projectId: ProjectId): Promise<Project | undefined>;
}
