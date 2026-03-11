import type { AgentConfig, WorkspaceId } from "@mono/api";

export type Workspace = {
  id: WorkspaceId;
  name: string;
  createdAt: Date;
  agentConfig: AgentConfig | null;
};
