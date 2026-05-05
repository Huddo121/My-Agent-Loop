import { deleteCodexTokens } from "../api";

export async function providersLogoutCodex(): Promise<void> {
  await deleteCodexTokens();
  console.log("Codex provider credentials removed from My Agent Loop.");
}
