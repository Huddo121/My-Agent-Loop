import { describe, expect, it, vi } from "vitest";
import type { UserId } from "../auth/UserId";
import type {
  OAuthProvider,
  OAuthProviderRefreshError,
  StoredOAuthTokens,
} from "../oauth-providers";
import type {
  UserOAuthCredentialRepository,
  UserOAuthCredentialSummary,
} from "../user-oauth-credentials";
import { ProtectedString } from "../utils/ProtectedString";
import type { Result } from "../utils/Result";
import {
  CompositeHarnessAuthService,
  EnvHarnessAuthService,
} from "./HarnessAuthService";

const userId = "user-1" as UserId;

const storedTokens: StoredOAuthTokens = {
  access_token: "access-token",
  id_token: "id-token",
  refresh_token: "refresh-token",
  account_id: "account-id",
};

describe("EnvHarnessAuthService", () => {
  it("returns api-key artifacts when an env key is configured", async () => {
    const service = new EnvHarnessAuthService({
      OPENAI_API_KEY: new ProtectedString("env-openai-key"),
    });

    const artifacts = await service.getAuthArtifacts("codex-cli", {
      workspaceOwnerUserId: userId,
    });

    expect(artifacts.kind).toBe("api-key");
    if (artifacts.kind === "api-key") {
      expect(artifacts.envName).toBe("OPENAI_API_KEY");
      expect(artifacts.value.getSecretValue()).toBe("env-openai-key");
    }
  });

  it("keeps opencode available without an API key", () => {
    const service = new EnvHarnessAuthService({});

    expect(service.isAvailable("opencode")).toBe(true);
    expect(service.getFallbackAuthArtifacts("opencode")).toEqual({
      kind: "none",
    });
  });
});

describe("CompositeHarnessAuthService", () => {
  it("prefers Codex OAuth artifacts over the env fallback", async () => {
    const repo = createOAuthCredentialRepository({
      tokens: JSON.stringify(storedTokens),
      lastRefresh: new Date("2026-05-01T00:00:00.000Z"),
    });
    const provider = createOAuthProvider();
    const service = createCompositeService(repo, provider);

    const artifacts = await service.getAuthArtifacts("codex-cli", {
      workspaceOwnerUserId: userId,
    });

    expect(artifacts).toEqual({
      kind: "files-and-env",
      files: [
        {
          containerPath: "/root/.codex/auth.json",
          contents: "sandbox-auth-json",
        },
      ],
      env: { CODEX_ENV: "oauth" },
    });
    expect(provider.refreshTokens).not.toHaveBeenCalled();
  });

  it("lazy-refreshes Codex OAuth tokens older than seven days and persists them", async () => {
    const repo = createOAuthCredentialRepository({
      tokens: JSON.stringify(storedTokens),
      lastRefresh: new Date("2026-04-20T00:00:00.000Z"),
    });
    const refreshedTokens: StoredOAuthTokens = {
      ...storedTokens,
      access_token: "refreshed-access-token",
    };
    const provider = createOAuthProvider({
      refreshResult: { success: true, value: refreshedTokens },
    });
    const service = createCompositeService(repo, provider);

    const artifacts = await service.getAuthArtifacts("codex-cli", {
      workspaceOwnerUserId: userId,
    });

    expect(provider.refreshTokens).toHaveBeenCalledWith(storedTokens);
    expect(repo.upsertCredential).toHaveBeenCalledWith(
      userId,
      "openai-codex",
      JSON.stringify(refreshedTokens),
      new Date("2026-05-04T00:00:00.000Z"),
    );
    expect(artifacts.kind).toBe("files-and-env");
    expect(provider.materializeForSandbox).toHaveBeenCalledWith(
      refreshedTokens,
    );
  });

  it("falls back to the env API key when stored Codex OAuth tokens are invalid", async () => {
    const repo = createOAuthCredentialRepository({
      tokens: JSON.stringify({ access_token: "missing-fields" }),
      lastRefresh: new Date("2026-05-01T00:00:00.000Z"),
    });
    const provider = createOAuthProvider();
    const service = createCompositeService(repo, provider);

    const artifacts = await service.getAuthArtifacts("codex-cli", {
      workspaceOwnerUserId: userId,
    });

    expect(artifacts.kind).toBe("api-key");
    if (artifacts.kind === "api-key") {
      expect(artifacts.value.getSecretValue()).toBe("env-openai-key");
    }
  });

  it("uses env auth for non-Codex harnesses", async () => {
    const repo = createOAuthCredentialRepository();
    const provider = createOAuthProvider();
    const service = createCompositeService(repo, provider);

    const artifacts = await service.getAuthArtifacts("claude-code", {
      workspaceOwnerUserId: userId,
    });

    expect(artifacts.kind).toBe("api-key");
    if (artifacts.kind === "api-key") {
      expect(artifacts.envName).toBe("ANTHROPIC_API_KEY");
      expect(artifacts.value.getSecretValue()).toBe("env-anthropic-key");
    }
    expect(repo.getCredential).not.toHaveBeenCalled();
  });
});

function createCompositeService(
  repo: UserOAuthCredentialRepository,
  provider: OAuthProvider,
): CompositeHarnessAuthService {
  return new CompositeHarnessAuthService(
    new EnvHarnessAuthService({
      OPENAI_API_KEY: new ProtectedString("env-openai-key"),
      ANTHROPIC_API_KEY: new ProtectedString("env-anthropic-key"),
    }),
    repo,
    provider,
    () => new Date("2026-05-04T00:00:00.000Z"),
  );
}

function createOAuthCredentialRepository(credential?: {
  tokens: string;
  lastRefresh: Date;
}): UserOAuthCredentialRepository {
  return {
    getCredential: vi.fn(async (_userId: UserId, providerId: string) =>
      credential === undefined
        ? undefined
        : {
            providerId,
            tokens: new ProtectedString(credential.tokens),
            lastRefresh: credential.lastRefresh,
          },
    ),
    upsertCredential: vi.fn(async () => {}),
    deleteCredential: vi.fn(async () => {}),
    listCredentials: vi.fn(
      async (): Promise<UserOAuthCredentialSummary[]> => [],
    ),
  };
}

function createOAuthProvider(options?: {
  refreshResult?: Result<StoredOAuthTokens, OAuthProviderRefreshError>;
}): OAuthProvider {
  const defaultRefreshResult: Result<
    StoredOAuthTokens,
    OAuthProviderRefreshError
  > = { success: true, value: storedTokens };

  return {
    providerId: "openai-codex",
    tokenEndpoint: "https://auth.openai.com/oauth/token",
    tokenBundleSchema: {
      safeParse(value: unknown) {
        if (
          typeof value === "object" &&
          value !== null &&
          "access_token" in value &&
          "id_token" in value &&
          "refresh_token" in value &&
          "account_id" in value
        ) {
          return { success: true, data: value as StoredOAuthTokens };
        }
        return { success: false, error: { issues: [] } };
      },
    } as OAuthProvider["tokenBundleSchema"],
    refreshTokens: vi.fn(
      async () => options?.refreshResult ?? defaultRefreshResult,
    ),
    materializeForSandbox: vi.fn(() => ({
      files: [
        {
          containerPath: "/root/.codex/auth.json",
          contents: "sandbox-auth-json",
        },
      ],
      env: { CODEX_ENV: "oauth" },
    })),
  };
}
