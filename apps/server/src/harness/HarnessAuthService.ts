import type { AgentHarnessId } from "@mono/api";
import { ProtectedString } from "../utils/ProtectedString";

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

type EnvForHarnessAuth = {
  OPENROUTER_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  CURSOR_API_KEY?: string;
  OPENAI_API_KEY?: string;
};

export class EnvHarnessAuthService implements HarnessAuthService {
  constructor(private readonly env: EnvForHarnessAuth) {}

  isAvailable(harnessId: AgentHarnessId): boolean {
    if (harnessId === "opencode") {
      return true;
    }
    const key = HARNESS_ENV_KEYS[harnessId];
    const value = this.env[key];
    return value !== undefined && value.length > 0;
  }

  getCredential(harnessId: AgentHarnessId): ProtectedString | undefined {
    const keyName = HARNESS_ENV_KEYS[harnessId];
    const value = this.env[keyName];
    if (value === undefined || value.length === 0) return undefined;
    return new ProtectedString(value);
  }
}
