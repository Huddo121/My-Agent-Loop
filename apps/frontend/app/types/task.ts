import type {
  AgentConfig,
  Subtask,
  SubtaskId,
  SubtaskState,
  TaskId,
} from "@mono/api";

export type { Subtask, SubtaskId, SubtaskState };

export type Task = {
  id: TaskId;
  title: string;
  description: string;
  completedOn: Date | null | undefined;
  agentConfig: AgentConfig | null;
  subtasks: Subtask[];
};

export type NewTask = {
  title: string;
  description: string;
  agentConfig?: AgentConfig | null;
  subtasks?: Subtask[];
};

export type UpdateTask = {
  title: string;
  description: string;
  agentConfig?: AgentConfig | null;
  subtasks?: Subtask[];
};
