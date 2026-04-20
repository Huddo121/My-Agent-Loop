import {
  type AgentConfig,
  createSubtaskId,
  SUBTASK_STATE_LABELS,
  SUBTASK_STATES,
  type Subtask,
  type SubtaskId,
  type SubtaskState,
  type TaskActiveRunState,
  type TaskId,
  type TaskNumber,
} from "@mono/api";

export { createSubtaskId, SUBTASK_STATES, SUBTASK_STATE_LABELS };
export type { Subtask, SubtaskId, SubtaskState };

export type Task = {
  id: TaskId;
  taskNumber: TaskNumber;
  title: string;
  description: string;
  completedOn?: Date | null | undefined;
  position?: number | null | undefined;
  activeRunState: TaskActiveRunState | null;
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
