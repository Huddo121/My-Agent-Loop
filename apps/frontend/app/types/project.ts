import type {
  ProjectId,
  ProjectShortCode,
  WorkflowConfigurationDto,
} from "@mono/api";

export type Project = {
  id: ProjectId;
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfigurationDto;
};

export type NewProject = {
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfigurationDto;
};
