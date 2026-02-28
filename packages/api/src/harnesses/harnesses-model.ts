import z from "zod";

export const agentHarnessIdSchema = z.enum([
  "opencode",
  "claude-code",
  "cursor-cli",
  "codex-cli",
]);
export type AgentHarnessId = z.infer<typeof agentHarnessIdSchema>;
