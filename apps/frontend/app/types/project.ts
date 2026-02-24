import type {
  ProjectId,
  ProjectShortCode,
  QueueStateDto,
  WorkflowConfigurationDto,
} from "@mono/api";

export type ForgeTypeDto = "gitlab" | "github";

export type Project = {
  id: ProjectId;
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfigurationDto;
  queueState: QueueStateDto;
  forgeType: ForgeTypeDto;
  forgeBaseUrl: string;
  hasForgeToken: boolean;
};

export type NewProject = {
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfigurationDto;
};
