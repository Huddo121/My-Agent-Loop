import type {
  ProjectId,
  ProjectShortCode,
  QueueStateDto,
  WorkflowConfigurationDto,
} from "@mono/api";

export type Project = {
  id: ProjectId;
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfigurationDto;
  queueState: QueueStateDto;
};

export type NewProject = {
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfigurationDto;
};
