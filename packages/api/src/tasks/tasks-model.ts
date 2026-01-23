import z from "zod";

export const taskIdSchema = z.string().brand<"TaskId">();
export type TaskId = z.infer<typeof taskIdSchema>;
