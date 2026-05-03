import type { AgentHarnessId } from "@mono/api";
import type { UserId } from "../auth/UserId";
import type {
  OAuthProvider,
  StoredOAuthTokens,
} from "../oauth-providers/types";
import type { UserOAuthCredentialRepository } from "../user-oauth-credentials";
import type { ProtectedString } from "../utils/ProtectedString";
import type { HarnessAuthArtifacts } from "./AgentHarness";

export type HarnessAuthContext = {
  workspaceOwnerUserId: UserId;
};

export interface HarnessAuthService {
  getAuthArtifacts(
    harnessId: AgentHarnessId,
    context: HarnessAuthContext,
  ): Promise<HarnessAuthArtifacts>;
  getFallbackAuthArtifacts(harnessId: AgentHarnessId): HarnessAuthArtifacts;
  isAvailable(harnessId: AgentHarnessId): boolean;
}

const HARNESS_ENV_KEYS: Record<
  AgentHarnessId,
  { envName: string; key: keyof EnvForHarnessAuth }
> = {
  opencode: { envName: "OPENROUTER_API_KEY", key: "OPENROUTER_API_KEY" },
  "claude-code": { envName: "ANTHROPIC_API_KEY", key: "ANTHROPIC_API_KEY" },
  "cursor-cli": { envName: "CURSOR_API_KEY", key: "CURSOR_API_KEY" },
  "codex-cli": { envName: "OPENAI_API_KEY", key: "OPENAI_API_KEY" },
};

export type EnvForHarnessAuth = {
  OPENROUTER_API_KEY?: ProtectedString;
  ANTHROPIC_API_KEY?: ProtectedString;
  CURSOR_API_KEY?: ProtectedString;
  OPENAI_API_KEY?: ProtectedString;
};

export class EnvHarnessAuthService implements HarnessAuthService {
  constructor(private readonly env: EnvForHarnessAuth) {}

  async getAuthArtifacts(
    harnessId: AgentHarnessId,
    _context: HarnessAuthContext,
  ): Promise<HarnessAuthArtifacts> {
    return this.getFallbackAuthArtifacts(harnessId);
  }

  getFallbackAuthArtifacts(harnessId: AgentHarnessId): HarnessAuthArtifacts {
    const { envName, key } = HARNESS_ENV_KEYS[harnessId];
    const value = this.env[key];
    if (value === undefined) {
      return { kind: "none" };
    }
    return { kind: "api-key", envName, value };
  }

  isAvailable(harnessId: AgentHarnessId): boolean {
    if (harnessId === "opencode") {
      return true;
    }
    return this.getFallbackAuthArtifacts(harnessId).kind !== "none";
  }
}

const OPENAI_CODEX_PROVIDER_ID = "openai-codex";
const OAUTH_REFRESH_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class CompositeHarnessAuthService implements HarnessAuthService {
  constructor(
    private readonly fallbackAuthService: EnvHarnessAuthService,
    private readonly userOAuthCredentialRepository: UserOAuthCredentialRepository,
    private readonly openAiCodexProvider: OAuthProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getAuthArtifacts(
    harnessId: AgentHarnessId,
    context: HarnessAuthContext,
  ): Promise<HarnessAuthArtifacts> {
    if (harnessId !== "codex-cli") {
      return this.fallbackAuthService.getAuthArtifacts(harnessId, context);
    }

    const oauthArtifacts = await this.getCodexOAuthArtifacts(context);
    if (oauthArtifacts.kind !== "none") {
      return oauthArtifacts;
    }

    return this.fallbackAuthService.getFallbackAuthArtifacts(harnessId);
  }

  getFallbackAuthArtifacts(harnessId: AgentHarnessId): HarnessAuthArtifacts {
    return this.fallbackAuthService.getFallbackAuthArtifacts(harnessId);
  }

  isAvailable(harnessId: AgentHarnessId): boolean {
    return this.fallbackAuthService.isAvailable(harnessId);
  }

  private async getCodexOAuthArtifacts(
    context: HarnessAuthContext,
  ): Promise<HarnessAuthArtifacts> {
    const credential = await this.userOAuthCredentialRepository.getCredential(
      context.workspaceOwnerUserId,
      OPENAI_CODEX_PROVIDER_ID,
    );

    if (credential === undefined) {
      return { kind: "none" };
    }

    const parsedTokens = this.parseStoredTokens(
      credential.tokens.getSecretValue(),
    );
    if (parsedTokens === undefined) {
      return { kind: "none" };
    }

    const tokens = await this.refreshIfStale(
      context.workspaceOwnerUserId,
      parsedTokens,
      credential.lastRefresh,
    );
    if (tokens === undefined) {
      return { kind: "none" };
    }

    const sandboxArtifacts =
      this.openAiCodexProvider.materializeForSandbox(tokens);
    return {
      kind: "files-and-env",
      files: sandboxArtifacts.files,
      env: sandboxArtifacts.env,
    };
  }

  private parseStoredTokens(rawTokens: string): StoredOAuthTokens | undefined {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawTokens);
    } catch {
      return undefined;
    }

    const parsed =
      this.openAiCodexProvider.tokenBundleSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return undefined;
    }

    return parsed.data;
  }

  private async refreshIfStale(
    workspaceOwnerUserId: UserId,
    tokens: StoredOAuthTokens,
    lastRefresh: Date,
  ): Promise<StoredOAuthTokens | undefined> {
    if (this.now().getTime() - lastRefresh.getTime() <= OAUTH_REFRESH_AGE_MS) {
      return tokens;
    }

    const refreshed = await this.openAiCodexProvider.refreshTokens(tokens);
    if (!refreshed.success) {
      return undefined;
    }

    await this.userOAuthCredentialRepository.upsertCredential(
      workspaceOwnerUserId,
      OPENAI_CODEX_PROVIDER_ID,
      JSON.stringify(refreshed.value),
      this.now(),
    );
    return refreshed.value;
  }
}
