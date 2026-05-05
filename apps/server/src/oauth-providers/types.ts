import type { z } from "zod";

import type { HarnessFile } from "../harness/AgentHarness";
import type { Result } from "../utils/Result";

export type OAuthProviderId = "openai-codex";

export type StoredOAuthTokens = {
  access_token: string;
  id_token: string;
  refresh_token: string;
  account_id: string;
};

export type OAuthProviderRefreshError =
  | { reason: "token-endpoint-unreachable"; cause: Error }
  | { reason: "token-endpoint-rejected"; status: number; body: string }
  | { reason: "invalid-token-response"; issues: string[] }
  | { reason: "invalid-access-token"; issues: string[] };

export type OAuthProviderSandboxArtifacts = {
  files: HarnessFile[];
  env: Record<string, string>;
};

export interface OAuthProvider {
  readonly providerId: OAuthProviderId;
  readonly tokenEndpoint: string;
  readonly tokenBundleSchema: z.ZodType<StoredOAuthTokens>;
  refreshTokens(
    stored: StoredOAuthTokens,
  ): Promise<Result<StoredOAuthTokens, OAuthProviderRefreshError>>;
  materializeForSandbox(
    stored: StoredOAuthTokens,
  ): OAuthProviderSandboxArtifacts;
}
