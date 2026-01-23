import type { TaskId } from "@mono/api";

export type Task = {
  id: TaskId;
  title: string;
  description: string;
  completedOn: Date | null | undefined;
};

export type NewTask = {
  title: string;
  description: string;
};

export type UpdateTask = {
  title: string;
  description: string;
};
