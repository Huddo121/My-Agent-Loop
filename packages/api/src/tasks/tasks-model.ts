import z from "zod";

export const taskIdSchema = z.string().brand<"TaskId">();
export type TaskId = z.infer<typeof taskIdSchema>;

export const subtaskIdSchema = z.string().brand<"SubtaskId">();
export type SubtaskId = z.infer<typeof subtaskIdSchema>;

export const subtaskStateSchema = z.enum([
  "pending",
  "in-progress",
  "completed",
  "cancelled",
]);
export type SubtaskState = z.infer<typeof subtaskStateSchema>;

export const subtaskSchema = z.object({
  id: subtaskIdSchema,
  title: z.string(),
  description: z.string().optional(),
  state: subtaskStateSchema,
});
export type Subtask = z.infer<typeof subtaskSchema>;
