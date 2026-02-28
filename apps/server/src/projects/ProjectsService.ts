import type { ProjectId, ProjectShortCode, WorkspaceId } from "@mono/api";
import type { ForgeType } from "../forge/types";
import type { WorkflowConfiguration } from "../workflow/Workflow";

export type QueueState =
  | "idle"
  | "processing-single"
  | "processing-loop"
  | "stopping"
  | "failed";

export interface Project {
  id: ProjectId;
  workspaceId: WorkspaceId;
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfiguration;
  queueState: QueueState;
  forgeType: ForgeType;
  forgeBaseUrl: string;
}

export type CreateProject = Omit<Project, "id" | "queueState">;

export type UpdateProject = Partial<Omit<Project, "id" | "queueState">>;

export interface ProjectsService {
  getAllProjects(workspaceId: WorkspaceId): Promise<Project[]>;
  getProject(projectId: ProjectId): Promise<Project | undefined>;
  getProjectByShortCode(
    workspaceId: WorkspaceId,
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
