import type { AgentConfig, TaskId } from "@mono/api";

export type Task = {
  id: TaskId;
  title: string;
  description: string;
  completedOn: Date | null | undefined;
  agentConfig: AgentConfig | null;
};

export type NewTask = {
  title: string;
  description: string;
  agentConfig?: AgentConfig | null;
};

export type UpdateTask = {
  title: string;
  description: string;
  agentConfig?: AgentConfig | null;
};
