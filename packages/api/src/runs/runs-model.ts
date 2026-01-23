import z from "zod";

export const runIdSchema = z.string().brand<"RunId">();
export type RunId = z.infer<typeof runIdSchema>;
