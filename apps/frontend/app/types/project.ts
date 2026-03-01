import type {
  AgentHarnessId,
  ProjectId,
  ProjectShortCode,
  QueueStateDto,
  WorkflowConfigurationDto,
  WorkspaceId,
} from "@mono/api";

export type ForgeTypeDto = "gitlab" | "github";

export type Project = {
  id: ProjectId;
  workspaceId: WorkspaceId;
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfigurationDto;
  queueState: QueueStateDto;
  forgeType: ForgeTypeDto;
  forgeBaseUrl: string;
  hasForgeToken: boolean;
  agentHarnessId: AgentHarnessId | null;
};

export type NewProject = {
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfigurationDto;
};
