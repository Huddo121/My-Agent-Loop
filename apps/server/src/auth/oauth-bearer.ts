import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { env } from "../env";
import type { UserId } from "./UserId";

/** Scopes required for MAL-issued OAuth access tokens (matches `oauthProvider` in `auth.ts`). */
export const MAL_OAUTH_ACCESS_TOKEN_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
] as const;

// JWT `issuer` / `aud` for access tokens match `jwt()` plugin in `auth.ts`.
const jwtIssuerAndAudience = new URL(env.APP_BASE_URL).origin;

/** JWKS URL for this issuer (`jwt` plugin default path under Better Auth `baseURL`). */
const malOAuthJwksUrl = `${new URL("/api/auth", env.APP_BASE_URL).toString().replace(/\/+$/, "")}/jwks`;

const verifyMalOAuthAccessToken =
  oauthProviderResourceClient(undefined).getActions().verifyAccessToken;

function parseBearerToken(request: Request): string | null {
  const raw = request.headers.get("authorization");
  if (raw === null) {
    return null;
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(raw.trim());
  return match?.[1] ?? null;
}

/**
 * Resolves `Authorization: Bearer <jwt>` to the subject user using Better Auth's
 * oauth-provider resource client (local JWKS verification, optional scope checks).
 * Returns `null` when the header is missing/invalid or the token fails verification
 * (wrong issuer/audience, expired, missing required scopes, bad signature, etc.).
 */
export async function requireOAuthBearer(
  request: Request,
): Promise<UserId | null> {
  const token = parseBearerToken(request);
  if (token === null) {
    return null;
  }

  try {
    const payload = await verifyMalOAuthAccessToken(token, {
      verifyOptions: {
        issuer: jwtIssuerAndAudience,
        audience: jwtIssuerAndAudience,
      },
      scopes: [...MAL_OAUTH_ACCESS_TOKEN_SCOPES],
      jwksUrl: malOAuthJwksUrl,
    });

    const sub = payload.sub;
    if (typeof sub !== "string" || sub.length === 0) {
      return null;
    }

    return sub as UserId;
  } catch {
    return null;
  }
}
