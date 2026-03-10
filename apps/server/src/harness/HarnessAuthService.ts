import type { AgentHarnessId } from "@mono/api";
import type { ProtectedString } from "../utils/ProtectedString";

export interface HarnessAuthService {
  isAvailable(harnessId: AgentHarnessId): boolean;
  getCredential(harnessId: AgentHarnessId): ProtectedString | undefined;
}

const HARNESS_ENV_KEYS: Record<AgentHarnessId, keyof EnvForHarnessAuth> = {
  opencode: "OPENROUTER_API_KEY",
  "claude-code": "ANTHROPIC_API_KEY",
  "cursor-cli": "CURSOR_API_KEY",
  "codex-cli": "OPENAI_API_KEY",
};

export type EnvForHarnessAuth = {
  OPENROUTER_API_KEY?: ProtectedString;
  ANTHROPIC_API_KEY?: ProtectedString;
  CURSOR_API_KEY?: ProtectedString;
  OPENAI_API_KEY?: ProtectedString;
};

export class EnvHarnessAuthService implements HarnessAuthService {
  constructor(private readonly env: EnvForHarnessAuth) {}

  isAvailable(harnessId: AgentHarnessId): boolean {
    if (harnessId === "opencode") {
      return true;
    }
    const key = HARNESS_ENV_KEYS[harnessId];
    return this.env[key] !== undefined;
  }

  getCredential(harnessId: AgentHarnessId): ProtectedString | undefined {
    const keyName = HARNESS_ENV_KEYS[harnessId];
    return this.env[keyName];
  }
}
