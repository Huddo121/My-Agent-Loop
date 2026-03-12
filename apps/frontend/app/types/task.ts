import {
  type AgentConfig,
  createSubtaskId,
  SUBTASK_STATE_LABELS,
  SUBTASK_STATES,
  type Subtask,
  type SubtaskId,
  type SubtaskState,
  type TaskId,
} from "@mono/api";

export { createSubtaskId, SUBTASK_STATES, SUBTASK_STATE_LABELS };
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
