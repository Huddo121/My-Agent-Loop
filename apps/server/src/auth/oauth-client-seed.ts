import { db } from "../db";
import { oauthClientTable } from "../db/schema";
import {
  getTransaction,
  withNewTransaction,
} from "../utils/transaction-context";

/** Stable primary key for the pre-registered `mal-cli` OAuth client row. */
const MAL_CLI_OAUTH_CLIENT_ROW_ID = "mal_cli_oauth_client_seed_v1";

const MAL_CLI_CLIENT_ID = "mal-cli";

const MAL_CLI_REDIRECT_URIS = ["http://localhost:53682/auth/callback"] as const;

const MAL_CLI_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
] as const;

/**
 * Ensures the first-party `mal-cli` public client exists for PKCE against this
 * issuer. Safe to call on every process boot (upserts on `client_id`).
 */
export async function ensureMalCliClient(): Promise<void> {
  const now = new Date();

  await withNewTransaction(db, async () => {
    const tx = getTransaction();

    await tx
      .insert(oauthClientTable)
      .values({
        id: MAL_CLI_OAUTH_CLIENT_ROW_ID,
        clientId: MAL_CLI_CLIENT_ID,
        clientSecret: null,
        disabled: false,
        skipConsent: true,
        scopes: [...MAL_CLI_SCOPES],
        redirectUris: [...MAL_CLI_REDIRECT_URIS],
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code", "refresh_token"],
        responseTypes: ["code"],
        public: true,
        requirePKCE: true,
        name: "mal-cli",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: oauthClientTable.clientId,
        set: {
          clientSecret: null,
          disabled: false,
          skipConsent: true,
          scopes: [...MAL_CLI_SCOPES],
          redirectUris: [...MAL_CLI_REDIRECT_URIS],
          tokenEndpointAuthMethod: "none",
          grantTypes: ["authorization_code", "refresh_token"],
          responseTypes: ["code"],
          public: true,
          requirePKCE: true,
          name: "mal-cli",
          updatedAt: now,
        },
      });
  });
}
