import type { ProjectId, ProjectShortCode } from "@mono/api";
import type { WorkflowConfiguration } from "../workflow/Workflow";

export type QueueState =
  | "idle"
  | "processing-single"
  | "processing-loop"
  | "stopping"
  | "failed";

export interface Project {
  id: ProjectId;
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfiguration;
  queueState: QueueState;
}

export type CreateProject = Omit<Project, "id" | "queueState">;

export type UpdateProject = Partial<Omit<Project, "id" | "queueState">>;

export interface ProjectsService {
  getAllProjects(): Promise<Project[]>;
  getProject(projectId: ProjectId): Promise<Project | undefined>;
  getProjectByShortCode(
    shortCode: ProjectShortCode,
  ): Promise<Project | undefined>;
  createProject(project: CreateProject): Promise<Project>;
  /**
   * Update the metadata of a project.
   */
  updateProject(
    projectId: ProjectId,
    project: UpdateProject,
  ): Promise<Project | undefined>;
  updateProjectQueueState(
    projectId: ProjectId,
    queueState: QueueState,
  ): Promise<Project | undefined>;
  deleteProject(projectId: ProjectId): Promise<Project | undefined>;
}
