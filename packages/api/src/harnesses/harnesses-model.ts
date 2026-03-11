import z from "zod";

export const agentHarnessIdSchema = z.enum([
  "opencode",
  "claude-code",
  "cursor-cli",
  "codex-cli",
]);
export type AgentHarnessId = z.infer<typeof agentHarnessIdSchema>;

export const agentConfigSchema = z.object({
  harnessId: agentHarnessIdSchema,
  modelId: z.string().nullable(),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;

export const harnessModelSchema = z.object({
  id: z.string(),
  displayName: z.string(),
});
export type HarnessModel = z.infer<typeof harnessModelSchema>;
