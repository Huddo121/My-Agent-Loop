import type { AgentHarnessId, WorkspaceId } from "@mono/api";

export type Workspace = {
  id: WorkspaceId;
  name: string;
  createdAt: Date;
  agentHarnessId: AgentHarnessId | null;
};
