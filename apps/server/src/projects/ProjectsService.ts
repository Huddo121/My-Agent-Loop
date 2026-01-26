import type { ProjectId, ProjectShortCode } from "@mono/api";
import type { WorkflowConfiguration } from "../workflow/Workflow";

export interface Project {
  id: ProjectId;
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfiguration;
}

type CreateProject = Omit<Project, "id">;

export interface ProjectsService {
  getAllProjects(): Promise<Project[]>;
  getProject(projectId: ProjectId): Promise<Project | undefined>;
  getProjectByShortCode(
    shortCode: ProjectShortCode,
  ): Promise<Project | undefined>;
  createProject(project: CreateProject): Promise<Project>;
  updateProject(project: Project): Promise<Project | undefined>;
  deleteProject(projectId: ProjectId): Promise<Project | undefined>;
}
