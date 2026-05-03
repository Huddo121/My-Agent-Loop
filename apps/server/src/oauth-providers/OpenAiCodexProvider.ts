import z from "zod";

import { parseChatGptJwt } from "./parseChatGptJwt";
import type {
  OAuthProvider,
  OAuthProviderRefreshError,
  OAuthProviderSandboxArtifacts,
  StoredOAuthTokens,
} from "./types";

const OPENAI_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_CODEX_AUTH_JSON_PATH = "/root/.codex/auth.json";

const openAiCodexRefreshResponseSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
});

export const openAiCodexTokenBundleSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1),
  refresh_token: z.string().min(1),
  account_id: z.string().min(1),
}) satisfies z.ZodType<StoredOAuthTokens>;

export class OpenAiCodexProvider implements OAuthProvider {
  readonly providerId = "openai-codex" as const;
  readonly tokenEndpoint = "https://auth.openai.com/oauth/token";
  readonly tokenBundleSchema = openAiCodexTokenBundleSchema;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async refreshTokens(
    stored: StoredOAuthTokens,
  ): Promise<
    | { success: true; value: StoredOAuthTokens }
    | { success: false; error: OAuthProviderRefreshError }
  > {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: stored.refresh_token,
      client_id: OPENAI_CODEX_CLIENT_ID,
    });

    let response: Response;
    try {
      response = await fetch(this.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
    } catch (cause) {
      return {
        success: false,
        error: {
          reason: "token-endpoint-unreachable",
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        },
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: {
          reason: "token-endpoint-rejected",
          status: response.status,
          body: await response.text(),
        },
      };
    }

    const responseBody: unknown = await response.json();
    const parsedResponse =
      openAiCodexRefreshResponseSchema.safeParse(responseBody);
    if (!parsedResponse.success) {
      return {
        success: false,
        error: {
          reason: "invalid-token-response",
          issues: parsedResponse.error.issues.map((issue) => issue.message),
        },
      };
    }

    const accountId = parseChatGptJwt(parsedResponse.data.access_token);
    if (!accountId.success) {
      return {
        success: false,
        error: {
          reason: "invalid-access-token",
          issues: accountId.error.issues,
        },
      };
    }

    return {
      success: true,
      value: {
        access_token: parsedResponse.data.access_token,
        id_token: parsedResponse.data.id_token,
        refresh_token:
          parsedResponse.data.refresh_token ?? stored.refresh_token,
        account_id: accountId.value,
      },
    };
  }

  materializeForSandbox(
    stored: StoredOAuthTokens,
  ): OAuthProviderSandboxArtifacts {
    return {
      files: [
        {
          containerPath: OPENAI_CODEX_AUTH_JSON_PATH,
          contents: JSON.stringify(
            {
              OPENAI_API_KEY: null,
              tokens: {
                access_token: stored.access_token,
                id_token: stored.id_token,
                refresh_token: stored.refresh_token,
                account_id: stored.account_id,
              },
              last_refresh: this.now().toISOString(),
            },
            null,
            2,
          ),
        },
      ],
      env: {},
    };
  }
}
