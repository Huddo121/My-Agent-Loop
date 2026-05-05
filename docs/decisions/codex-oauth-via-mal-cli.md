# Codex OAuth via mal

## Context

Codex CLI can use OpenAI subscription authentication when it starts with a Codex `auth.json` file produced by the Codex OAuth flow. The existing My Agent Loop harness configuration already supported environment API keys, but that path uses API-key billing and does not help users whose access is tied to their OpenAI subscription.

The OAuth callback for Codex is a local-machine flow on `http://localhost:1455/auth/callback`. That is a poor fit for the multi-user MAL server, so the user-facing OAuth broker belongs in a local CLI instead of in the server process.

## Decision

- Add `apps/mal-cli` as the local OAuth helper for users.
- Make MAL an OAuth issuer for `mal-cli` so the CLI can authenticate to MAL before uploading provider credentials.
- Store provider OAuth credentials per user on the server, encrypted at rest, and never return token material from APIs.
- Implement OpenAI Codex OAuth as the first provider, with provider abstractions left in place for later additions.
- Prefer a workspace creator's stored OpenAI Codex OAuth credential when preparing Codex runs; fall back to `OPENAI_API_KEY` only when no OAuth credential is available.
- Keep credential-management UI out of v1. Users manage credentials with `mal`.

## CLI OAuth Flow

`mal login` authenticates the CLI to MAL using PKCE against the MAL Better Auth OAuth issuer:

- client id: `mal-cli`
- redirect URI: `http://localhost:53682/auth/callback`
- scope: `openid profile email offline_access`
- default MAL origin: `http://localhost:5173`, overridable with `MAL_BASE_URL`

`mal providers login codex` then runs the OpenAI Codex OAuth flow locally:

- authorization URL: `https://auth.openai.com/oauth/authorize`
- token URL: `https://auth.openai.com/oauth/token`
- client id: `app_EMoamEEZ73f0CkXaXp7hrann`
- redirect URI: `http://localhost:1455/auth/callback`
- scope: `openid profile email offline_access`

The CLI opens the browser and prints the authorization URL so headless or SSH users can complete the flow manually. Local OAuth listeners time out after five minutes. Port `1455` is fixed by the Codex OAuth client registration, so only one Codex provider login can run at a time.

CLI storage lives at `${XDG_CONFIG_HOME:-~/.config}/mal/auth.json`. The config directory is created with mode `0700`, and the auth file is written with mode `0600`. The CLI still reads and clears the legacy `${XDG_CONFIG_HOME:-~/.config}/mal-cli/auth.json` path during upgrades.

## Server Credential Storage

User provider credentials are stored in `user_harness_oauth_credentials`.

The row key is `(userId, providerId)`, so the latest login wins for a user/provider pair. Token material is encrypted with `SaltedEncryptionService` using `OAUTH_CREDENTIALS_ENCRYPTION_KEY`, not `FORGE_ENCRYPTION_KEY`. Each record stores a random per-record `keySalt` and an AES-256-GCM payload in the same `iv:ciphertext:authTag` base64 format as forge secrets.

The API surface is intentionally narrow:

- `GET /api/me/harness-credentials` returns provider ids and refresh timestamps only.
- `PUT /api/me/harness-credentials/:providerId` accepts token material from the authenticated CLI.
- `DELETE /api/me/harness-credentials/:providerId` deletes the stored provider credential.

These endpoints authenticate with a MAL OAuth bearer token issued to `mal-cli`, not a browser session cookie.

## Harness Resolution

For `codex-cli`, runtime auth resolution checks the workspace creator's `openai-codex` credential first. If the credential exists, the server materializes `/root/.codex/auth.json` for the sandbox and does not set `OPENAI_API_KEY`. If no OAuth credential exists, the existing `OPENAI_API_KEY` path remains the fallback.

OAuth token refresh is lazy: the server refreshes Codex tokens during run preparation when the stored refresh age is greater than seven days. There is no background refresh job and no write-back from the running sandbox.

## Consequences

- Workflows can run Codex under a user's OpenAI subscription without requiring an API key.
- The CLI must be run on a machine that can receive the local OAuth callback, or through suitable SSH port forwarding.
- Provider logout deletes local/server state only; v1 does not call provider revocation endpoints.
- Multi-user workspace credential policy is deliberately simple in v1: use the workspace creator's credential.
- Database migration SQL is still human-owned. Agents can surface generated schema diffs, but should not author migration files.
