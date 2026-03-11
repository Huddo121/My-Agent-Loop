import type { WorkspaceId } from "@mono/api";
import type { ScopedHarnessConfig } from "../harness/AgentHarnessConfigRepository";

export interface Workspace {
  id: WorkspaceId;
  name: string;
  createdAt: Date;
  agentConfig: ScopedHarnessConfig | null;
}

export type CreateWorkspace = { name: string };

export type UpdateWorkspace = {
  name?: string;
  agentConfig?: ScopedHarnessConfig | null;
};
