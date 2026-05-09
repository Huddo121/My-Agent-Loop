import type { AgentHarnessId } from "@mono/api";
import type { UserId } from "../auth/UserId";
import type {
  OAuthProvider,
  StoredOAuthTokens,
} from "../oauth-providers/types";
import type { UserOAuthCredentialRepository } from "../user-oauth-credentials";
import type { ProtectedString } from "../utils/ProtectedString";
import type { HarnessAuthArtifacts } from "./AgentHarness";

export type HarnessAuthContext =
  | {
      kind: "workspace-owner";
      workspaceOwnerUserId: UserId;
    }
  | {
      kind: "no-workspace-owner";
    };

export type HarnessAvailability = {
  isAvailable: boolean;
  source: "env" | "workspace-owner-oauth" | "none";
};

type WorkspaceOwnerAuthContext = Extract<
  HarnessAuthContext,
  { kind: "workspace-owner" }
>;

export interface HarnessAuthService {
  /**
   * Resolve the auth material that should be mounted into a harness run.
   * Implementations may use workspace-scoped context, such as the workspace
   * owner, to prefer user OAuth credentials before falling back to static
   * environment credentials.
   */
  getAuthArtifacts(
    harnessId: AgentHarnessId,
    context: HarnessAuthContext,
  ): Promise<HarnessAuthArtifacts>;
  /**
   * Report whether a harness can be selected in a specific workspace context.
   * This must remain a cheap metadata check: do not decrypt, parse, refresh, or
   * otherwise validate stored OAuth token material here.
   */
  getAvailability(
    harnessId: AgentHarnessId,
    context: HarnessAuthContext,
  ): Promise<HarnessAvailability>;
  /**
   * Report whether a harness can be selected before a concrete run exists.
   * This only reflects static availability, not per-workspace OAuth state.
   */
  isAvailable(harnessId: AgentHarnessId): boolean;
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

  async getAuthArtifacts(
    harnessId: AgentHarnessId,
    _context: HarnessAuthContext,
  ): Promise<HarnessAuthArtifacts> {
    const envName = HARNESS_ENV_KEYS[harnessId];
    const value = this.env[envName];
    if (value === undefined) {
      return { kind: "none" };
    }
    return { kind: "api-key", envName, value };
  }

  async getAvailability(
    harnessId: AgentHarnessId,
    _context: HarnessAuthContext,
  ): Promise<HarnessAvailability> {
    if (harnessId === "opencode") {
      return { isAvailable: true, source: "none" };
    }

    if (this.env[HARNESS_ENV_KEYS[harnessId]] !== undefined) {
      return { isAvailable: true, source: "env" };
    }

    return { isAvailable: false, source: "none" };
  }

  isAvailable(harnessId: AgentHarnessId): boolean {
    if (harnessId === "opencode") {
      return true;
    }
    return this.env[HARNESS_ENV_KEYS[harnessId]] !== undefined;
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

    if (context.kind === "workspace-owner") {
      const oauthArtifacts = await this.getCodexOAuthArtifacts(context);
      if (oauthArtifacts.kind !== "none") {
        return oauthArtifacts;
      }
    }

    return this.fallbackAuthService.getAuthArtifacts(harnessId, context);
  }

  isAvailable(harnessId: AgentHarnessId): boolean {
    return this.fallbackAuthService.isAvailable(harnessId);
  }

  async getAvailability(
    harnessId: AgentHarnessId,
    context: HarnessAuthContext,
  ): Promise<HarnessAvailability> {
    if (harnessId !== "codex-cli") {
      return this.fallbackAuthService.getAvailability(harnessId, context);
    }

    if (context.kind === "workspace-owner") {
      const hasOAuthCredential =
        await this.userOAuthCredentialRepository.hasCredential(
          context.workspaceOwnerUserId,
          OPENAI_CODEX_PROVIDER_ID,
        );
      if (hasOAuthCredential) {
        return { isAvailable: true, source: "workspace-owner-oauth" };
      }
    }

    return this.fallbackAuthService.getAvailability(harnessId, context);
  }

  private async getCodexOAuthArtifacts(
    context: WorkspaceOwnerAuthContext,
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
