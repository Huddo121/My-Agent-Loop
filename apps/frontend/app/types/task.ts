import type { AgentHarnessId, TaskId } from "@mono/api";

export type Task = {
  id: TaskId;
  title: string;
  description: string;
  completedOn: Date | null | undefined;
  agentHarnessId: AgentHarnessId | null;
};

export type NewTask = {
  title: string;
  description: string;
  agentHarnessId?: AgentHarnessId | null;
};

export type UpdateTask = {
  title: string;
  description: string;
  agentHarnessId?: AgentHarnessId | null;
};
