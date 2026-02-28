import z from "zod";

export const workspaceIdSchema = z.string().brand<"WorkspaceId">();
export type WorkspaceId = z.infer<typeof workspaceIdSchema>;
