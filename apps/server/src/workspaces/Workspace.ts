import type { AgentHarnessId, WorkspaceId } from "@mono/api";

export interface Workspace {
  id: WorkspaceId;
  name: string;
  createdAt: Date;
  agentHarnessId: AgentHarnessId | null;
}

export type CreateWorkspace = { name: string };

export type UpdateWorkspace = {
  name?: string;
  agentHarnessId?: AgentHarnessId | null;
};
