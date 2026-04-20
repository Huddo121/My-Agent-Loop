import z from "zod";

export const taskIdSchema = z.string().brand<"TaskId">();
export type TaskId = z.infer<typeof taskIdSchema>;

export const taskNumberSchema = z
  .number()
  .int()
  .positive()
  .brand<"TaskNumber">();
export type TaskNumber = z.infer<typeof taskNumberSchema>;

export const subtaskIdSchema = z.string().brand<"SubtaskId">();
export type SubtaskId = z.infer<typeof subtaskIdSchema>;

export const SUBTASK_STATES = [
  "pending",
  "in-progress",
  "completed",
  "cancelled",
] as const;

export const subtaskStateSchema = z.enum(SUBTASK_STATES);
export type SubtaskState = z.infer<typeof subtaskStateSchema>;

export const SUBTASK_STATE_LABELS: Record<SubtaskState, string> = {
  pending: "Pending",
  "in-progress": "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const subtaskSchema = z.object({
  id: subtaskIdSchema,
  title: z.string(),
  description: z.string().optional(),
  state: subtaskStateSchema,
});
export type Subtask = z.infer<typeof subtaskSchema>;

export function createSubtaskId(): SubtaskId {
  return globalThis.crypto.randomUUID().slice(0, 8) as SubtaskId;
}
