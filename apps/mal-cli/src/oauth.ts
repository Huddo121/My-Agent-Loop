import { z } from "zod";
import { malOAuthConfig } from "./config";
import type { StoredToken } from "./storage";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  expires_in: z.coerce.number().positive().optional(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

function decodeJwtPayload(token: string): unknown {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function expiryFromJwt(token: string): string | undefined {
  const payload = decodeJwtPayload(token);
  const exp =
    typeof payload === "object" &&
    payload !== null &&
    "exp" in payload &&
    typeof payload.exp === "number"
      ? payload.exp
      : undefined;

  return exp === undefined ? undefined : new Date(exp * 1000).toISOString();
}

export function isExpired(token: StoredToken, clock = new Date()): boolean {
  if (!token.expiresAt) {
    return false;
  }

  return new Date(token.expiresAt).getTime() <= clock.getTime() + 30_000;
}

export function tokenResponseToStoredToken(
  response: TokenResponse,
  previous?: StoredToken,
): StoredToken {
  const expiresAt =
    response.expires_in !== undefined
      ? new Date(Date.now() + response.expires_in * 1000).toISOString()
      : expiryFromJwt(response.access_token);

  const refreshToken = response.refresh_token ?? previous?.refreshToken;
  if (!refreshToken) {
    throw new Error("OAuth token response did not include a refresh token.");
  }

  return {
    accessToken: response.access_token,
    refreshToken,
    idToken: response.id_token ?? previous?.idToken,
    tokenType: response.token_type ?? previous?.tokenType,
    scope: response.scope ?? previous?.scope,
    expiresAt,
  };
}

export async function exchangeToken(
  tokenUrl: string,
  body: URLSearchParams,
): Promise<TokenResponse> {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const rawBody = await response.text();
  const parsedBody = rawBody ? JSON.parse(rawBody) : {};

  if (!response.ok) {
    const message =
      typeof parsedBody === "object" &&
      parsedBody !== null &&
      "error_description" in parsedBody &&
      typeof parsedBody.error_description === "string"
        ? parsedBody.error_description
        : rawBody;
    throw new Error(`OAuth token exchange failed: ${message}`);
  }

  return tokenResponseSchema.parse(parsedBody);
}

export async function refreshMalToken(
  tokenUrl: string,
  token: StoredToken,
): Promise<StoredToken> {
  const response = await exchangeToken(
    tokenUrl,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      client_id: malOAuthConfig.clientId,
    }),
  );

  return tokenResponseToStoredToken(response, token);
}
