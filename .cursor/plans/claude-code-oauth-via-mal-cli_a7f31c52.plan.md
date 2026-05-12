---
name: claude-code-oauth-via-mal-cli
overview: Add Anthropic Claude Code subscription OAuth as a second user-OAuth provider in MAL, brokered by the local `mal` CLI in the same shape as the existing OpenAI Codex flow. Generalises the provider/credential abstractions so the Codex-specific hardcoding becomes a per-provider lookup, adds an `AnthropicClaudeCodeProvider` for the server, adds a stdin-paste OAuth flow to the CLI (because Anthropic's redirect goes to platform.claude.com rather than localhost), wires Claude Code harness runs to consume the workspace owner's stored credential, and falls back to `ANTHROPIC_API_KEY` when no OAuth credential exists.
todos:
  - id: widen_provider_id_union
    content: |
      Widen `OAuthProviderId` in `apps/server/src/oauth-providers/types.ts` from the single `"openai-codex"` literal to a union `"openai-codex" | "claude-code"`. Mirror this in `packages/api/src/me/me-api.ts` by changing `harnessCredentialProviderIdSchema` from `z.literal("openai-codex")` to `z.union([z.literal("openai-codex"), z.literal("claude-code")])`. Update any exhaustive `switch`/`if` callers (`isProviderId` / `parseProviderId` in `apps/server/src/me/me-handlers.ts`, `credentialSummarySchema` in `apps/mal-cli/src/api.ts`) to include the new variant. Fix typecheck and unit-test breakages caused by the wider type. No new behaviour yet — `claude-code` is an unhandled provider until later todos.
    status: pending
  - id: parameterise_oauth_provider_interface
    content: |
      Decouple `OAuthProvider` and `StoredOAuthTokens` from the OpenAI shape. In `apps/server/src/oauth-providers/types.ts`, turn `OAuthProvider` into `OAuthProvider<TStored>` and remove the hardcoded `account_id: string` field from the base `StoredOAuthTokens` (or rename it to `OpenAiStoredOAuthTokens` and define a base type with only the fields every provider has — at minimum `access_token` and `refresh_token`). Each provider declares its own `tokenBundleSchema: z.ZodType<TStored>`. Add a new method `validateUpload(tokens: {access_token: string; refresh_token: string; id_token?: string}): Promise<Result<TStored, {issues: string[]}>>` so the upload handler can delegate provider-specific validation (Codex parses the JWT to derive `account_id`; Anthropic just type-checks). Update `OpenAiCodexProvider` to satisfy the new generic shape — its `validateUpload` wraps the existing `parseChatGptJwt` + zod parse logic. Update `apps/server/src/oauth-providers/index.ts` exports. Tests in `OpenAiCodexProvider.test.ts` continue to pass.
    status: pending
  - id: generalise_me_handlers_upload
    content: |
      Refactor the PUT handler in `apps/server/src/me/me-handlers.ts` to delegate validation to the provider rather than calling `parseChatGptJwt` and `openAiCodexTokenBundleSchema` inline. Pattern: receive an `OAuthProvidersRegistry` (a `Record<OAuthProviderId, OAuthProvider<any>>`) via `services`, look up the provider by path param, call `provider.validateUpload(ctx.body.tokens)` and pipe the result into `upsertCredential`. Behaviour for `openai-codex` must remain identical (including the `Access token is not a valid ChatGPT JWT` and `Harness credential tokens are invalid` error messages). Update `apps/server/src/me/me-handlers.test.ts` accordingly — the existing fake/mocked provider gets a `validateUpload` stub. Loosen the body schema in `packages/api/src/me/me-api.ts`: change `tokens` to `{access_token: string; refresh_token: string; id_token?: string}` so the Anthropic upload (no `id_token`) is accepted by the wire schema; per-provider strictness is enforced server-side via `validateUpload`.
    status: pending
  - id: harness_provider_mapping
    content: |
      Replace the hardcoded `if (harnessId !== "codex-cli")` Codex check in `apps/server/src/harness/HarnessAuthService.ts` (both `getAuthArtifacts` and `getAvailability`) with a `Map<AgentHarnessId, OAuthProvider<any>>` injected into `CompositeHarnessAuthService`. The map is built at services-wiring time: `"codex-cli" → OpenAiCodexProvider`, and later `"claude-code" → AnthropicClaudeCodeProvider`. Move the `OPENAI_CODEX_PROVIDER_ID` constant logic into a generic helper that takes `(harnessId, provider)` and returns the workspace-owner OAuth artifacts via the existing repository, refresh-if-stale, and `materializeForSandbox` pipeline. The hardcoded `OPENAI_CODEX_PROVIDER_ID` constant is removed; `providerId` is derived from `provider.providerId`. Existing tests in `HarnessAuthService.test.ts` continue to pass — only Codex behaviour is exercised at this point.
    status: pending
  - id: anthropic_provider_implementation
    content: |
      Add `apps/server/src/oauth-providers/AnthropicClaudeCodeProvider.ts`. Constants — pin at module top, override via env where noted:

      ```ts
      const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
      const TOKEN_ENDPOINT = "https://platform.claude.com/v1/oauth/token";
      const ANTHROPIC_CREDENTIALS_PATH = "/root/.claude/.credentials.json";
      const DEFAULT_USER_AGENT = `claude-cli/${env.ANTHROPIC_CLI_VERSION ?? "2.1.139"} (external, cli)`;
      ```

      Add a new env var `ANTHROPIC_CLI_VERSION?: string` to `apps/server/src/env.ts` (optional, no default) so the User-Agent version can be bumped without a redeploy. The User-Agent header must be sent on every call to `TOKEN_ENDPOINT` — Anthropic rejects requests from "external" clients that don't look like the real Claude Code CLI.

      Stored token shape (`AnthropicStoredOAuthTokens`):
      ```ts
      {
        access_token: string;    // sk-ant-oat01-...
        refresh_token: string;   // sk-ant-ort01-...
        expires_at: number;      // ms-since-epoch (NOT seconds, NOT ISO)
        scopes: string[];
      }
      ```
      Provide the corresponding zod schema.

      `validateUpload({access_token, refresh_token, id_token?})`: ignore `id_token`. There is no JWT to verify (Anthropic access tokens are opaque). Sanity-check the `sk-ant-oat01-` and `sk-ant-ort01-` prefixes; if either is missing return `{issues: ["Token does not look like an Anthropic OAuth token"]}`. On success, populate `expires_at = Date.now() + 60*60*1000` as a safe default (real `expires_at` will be set by the CLI in the upload body — see `claude_code_provider_upload_metadata` todo).

      `refreshTokens(stored)`: POST `TOKEN_ENDPOINT` with `Content-Type: application/x-www-form-urlencoded`, `User-Agent: <DEFAULT_USER_AGENT>`, body `grant_type=refresh_token&refresh_token=<stored.refresh_token>&client_id=<CLIENT_ID>`. Parse the response `{access_token, refresh_token, expires_in}` and return `{access_token, refresh_token, expires_at: Date.now() + expires_in*1000, scopes: stored.scopes}`. CRITICAL: do NOT fall back to `stored.refresh_token` if the response is missing one — Anthropic rotates refresh tokens and dropping the new one on the floor breaks the next refresh. Reuse `OAuthProviderRefreshError` for error mapping.

      `materializeForSandbox(stored)`: return one file at `ANTHROPIC_CREDENTIALS_PATH` with JSON contents:
      ```json
      {
        "claudeAiOauth": {
          "accessToken": "<stored.access_token>",
          "refreshToken": "<stored.refresh_token>",
          "expiresAt": <stored.expires_at>,
          "scopes": <stored.scopes>
        }
      }
      ```
      No env vars (return `env: {}`). Mode: default (file is sensitive but server only mounts it; the existing Codex `auth.json` path doesn't set a mode either).

      Add `AnthropicClaudeCodeProvider.test.ts` covering: refresh success, refresh rotates the refresh token, refresh failure on 401 (`token-endpoint-rejected`), refresh failure on network error (`token-endpoint-unreachable`), `materializeForSandbox` shape, `validateUpload` happy path and prefix mismatch.
    status: pending
  - id: claude_code_provider_upload_metadata
    content: |
      The CLI obtains a real `expires_in` from the token exchange and needs to convey `expires_at` plus `scopes` to the server so they end up in the stored bundle (otherwise `materializeForSandbox` will emit a stale `expiresAt` and Claude Code will refresh on every cold start, hammering Anthropic and risking rate-limits). Extend the PUT body in `packages/api/src/me/me-api.ts` so `tokens` carries optional `expires_at: number` (ms-since-epoch) and `scopes: string[]`. In `AnthropicClaudeCodeProvider.validateUpload`, use the provided `expires_at`/`scopes` when present; otherwise compute `expires_at = Date.now() + 60*60*1000` and default `scopes = ["user:inference"]`. Codex's validateUpload ignores the new optional fields. Mirror the schema widening in `apps/mal-cli/src/api.ts` (the `uploadCodexTokens` request shape gains the optional fields too, even though Codex won't send them). Tests in `me-handlers.test.ts` cover both providers' upload paths.
    status: pending
  - id: claude_code_harness_files_and_env_artifact
    content: |
      Update `apps/server/src/harness/ClaudeCodeHarness.ts` so `prepare()` handles `auth.kind === "files-and-env"` (it currently only handles `api-key` and silently no-ops on anything else). When `auth.kind === "files-and-env"`, take `auth.files` verbatim into `preparation.files`, merge `auth.env` into the run env, and skip writing `ANTHROPIC_API_KEY`. The api-key branch is unchanged. Add a unit test (mirror the style of `CodexCliHarness.test.ts`) covering both auth kinds.
    status: pending
  - id: services_wiring
    content: |
      In `apps/server/src/services.ts`, instantiate `new AnthropicClaudeCodeProvider()`, build an `OAuthProvidersRegistry: Record<OAuthProviderId, OAuthProvider<any>>` containing both providers, pass it to `CompositeHarnessAuthService` (replacing the single `openAiCodexProvider` arg) and to `meHandlers` (via `services`). Build the harness↔provider map (`{"codex-cli": openAiCodexProvider, "claude-code": anthropicClaudeCodeProvider}`) and pass it to the composite auth service per the `harness_provider_mapping` todo. Update `Services` type in the same file. Add the new env field `ANTHROPIC_CLI_VERSION` to `env.ts`'s zod schema (`z.string().optional()`).
    status: pending
  - id: preemptive_refresh_window
    content: |
      In `CompositeHarnessAuthService`, change the refresh-if-stale heuristic so it works for both providers. Today the code checks `now - lastRefresh > 7 days`, which is wrong for Anthropic (tokens expire in ~1h–8h). The fix:

      Per-provider policy: each `OAuthProvider` exposes `shouldRefresh(stored, now): boolean`. Codex's implementation keeps today's "lastRefresh older than 7 days" rule (the credential repo still tracks lastRefresh, and Codex stored bundles don't carry `expires_at`). Anthropic's implementation returns `true` when `stored.expires_at - now.getTime() < 60 * 60 * 1000` (one-hour buffer before expiry).

      Substantiation for the window: the access-token lifetime was directly observed to be ~8 hours by inspecting a real `~/.claude/.credentials.json` produced by `claude` in a container (`expiresAt - issuedAt ≈ 28800000ms`). This matches the `~8 hours` cited in `anthropics/claude-code#44945`. Some third-party writeups (e.g. `daveswift.com/claude-oauth-update/`) say "within 60 minutes" — disregard, that's not what we see in practice. The OpenCode plugin reads `expires_in` from the response and trusts it; we do the same. A one-hour buffer leaves seven hours of headroom per refresh while keeping us well clear of the cliff.

      Update `HarnessAuthService.test.ts` (or split into provider-specific test files) to cover: (a) Codex no-refresh when `lastRefresh` is recent, (b) Codex refresh when stale, (c) Anthropic no-refresh when `expires_at` is far in the future, (d) Anthropic refresh when `expires_at - now < 1h`, including the case where `expires_at` is in the past, (e) Anthropic refresh failure surfaces as `kind: "none"` (same as Codex today).
    status: pending
  - id: cli_paste_flow_helper
    content: |
      Add `apps/mal-cli/src/codePasteFlow.ts`. Exports a single function `runCodePasteFlow(options: {authorizeUrl: string; expectedState: string; promptLabel?: string}): Promise<{code: string}>`. Behaviour:

      1. `console.log("Open this URL to continue:\n" + options.authorizeUrl)`.
      2. Best-effort `openBrowser(options.authorizeUrl)` (use the existing `open` import pattern from `oauthFlow.ts`); on failure log a warning but continue.
      3. Use Node's built-in `readline` (`readline/promises` is fine — Node 22+) to prompt: `"Paste the code from your browser: "`. Read one line, trim it.
      4. The browser displays `<code>#<state>`. Split on the first `#`. If there's no `#`, treat the whole string as the code with no state.
      5. If a state portion exists and `state !== options.expectedState`, throw an `Error("OAuth callback state did not match.")`.
      6. If the code portion is empty, throw.
      7. Return `{code}`.

      Do NOT spin up a local listener — Anthropic redirects to `https://platform.claude.com/oauth/code/callback`, not localhost. Five-minute readline timeout via `AbortController` (mirror the timeout in `oauthFlow.ts`).

      Unit-test the parser by extracting `parsePastedCode(raw, expectedState)` so it can be tested without stdin. Tests cover: code without `#` (state validation skipped, returns code), code with matching state, code with mismatched state (throws), empty code (throws).
    status: pending
  - id: cli_anthropic_config
    content: |
      Add `anthropicClaudeCodeOAuthConfig` to `apps/mal-cli/src/config.ts`. Fields — `authorizeUrl: "https://claude.ai/oauth/authorize"`, `tokenUrl: "https://platform.claude.com/v1/oauth/token"`, `clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e"`, `redirectUri: "https://platform.claude.com/oauth/code/callback"`, `scope: "user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload"`, `userAgent: \`claude-cli/${process.env.MAL_ANTHROPIC_CLI_VERSION ?? "2.1.139"} (external, cli)\``. The version env override mirrors the server-side `ANTHROPIC_CLI_VERSION` knob.
    status: pending
  - id: cli_oauth_helper_supports_user_agent
    content: |
      Extend `exchangeToken` in `apps/mal-cli/src/oauth.ts` to accept an optional `headers?: Record<string, string>` argument and merge it into the fetch headers (after the hardcoded `content-type`). All existing call sites continue to work because the parameter is optional. This is required so the Claude Code token exchange and refresh can send `User-Agent: claude-cli/...` — Anthropic rejects requests from clients that don't look like the real Claude Code CLI.
    status: pending
  - id: cli_login_command
    content: |
      Add `apps/mal-cli/src/commands/providers-login-claude-code.ts`. Structure mirrors `providers-login-codex.ts` with these differences:

      - Use `createPkceChallenge()` from `./pkce` (separate `state` and `codeVerifier`, matching the existing CLI pattern).
      - Construct the authorize URL using `anthropicClaudeCodeOAuthConfig`. Include `code=true` (this is what makes claude.ai display the code on a page instead of redirecting). Required params: `code=true`, `response_type=code`, `client_id`, `redirect_uri`, `scope`, `code_challenge`, `code_challenge_method=S256`, `state` (use `pkce.state`, NOT `pkce.codeVerifier`).
      - Call `runCodePasteFlow({authorizeUrl, expectedState: pkce.state})` instead of `runOAuthFlow`.
      - Call `exchangeToken(tokenUrl, body, {"User-Agent": anthropicClaudeCodeOAuthConfig.userAgent})`. Body params: `grant_type=authorization_code`, `code`, `code_verifier=pkce.codeVerifier`, `client_id`, `redirect_uri`, `state=pkce.state`. (Anthropic accepts `state` in the body; the OpenCode plugin sends it.)
      - On success the response has `{access_token, refresh_token, expires_in}` (no `id_token`). Compute `expires_at = Date.now() + expires_in*1000`.
      - Call a new `uploadClaudeCodeTokens({access_token, refresh_token, expires_at, scopes: anthropicClaudeCodeOAuthConfig.scope.split(" ")})` in `api.ts`. Print `"Claude Code provider credentials saved to My Agent Loop."` on success.

      Error mapping: when the token endpoint returns 401/403 with a body mentioning user-agent or "external", include a hint that `MAL_ANTHROPIC_CLI_VERSION` may need bumping.
    status: pending
  - id: cli_logout_command_and_api_helpers
    content: |
      Add `apps/mal-cli/src/commands/providers-logout-claude-code.ts` (one-liner deleting via a new `deleteClaudeCodeTokens()` API helper). In `apps/mal-cli/src/api.ts`, add `uploadClaudeCodeTokens` and `deleteClaudeCodeTokens` (analogous to the existing Codex versions) parameterised on the `claude-code` provider id. Refactor `uploadCodexTokens`/`deleteCodexTokens` to a generic `uploadHarnessCredentials(providerId, tokens)` / `deleteHarnessCredentials(providerId)` pair so both providers share one implementation; keep the named wrappers for call-site clarity.
    status: pending
  - id: cli_command_router_and_status
    content: |
      Update `apps/mal-cli/src/index.ts`:
      - Widen the `providers` command tuple from `z.literal("codex")` to `z.enum(["codex", "claude-code"])`.
      - Dispatch to `providersLoginClaudeCode` / `providersLogoutClaudeCode` for the new provider.
      - Update the `providersCommand.description` to list both providers.

      Update `apps/mal-cli/src/commands/status.ts` to list both providers' state. After fetching `listHarnessCredentials()`, iterate over the known providers (`"openai-codex"`, `"claude-code"`) and emit a line for each — `"Codex provider: configured (last refreshed ...)" / "Codex provider: not configured"` and the same shape for `"Claude Code provider: ..."`. Use a small static map from `providerId → displayName` so the status output is consistent.
    status: pending
  - id: harness_auth_fallback_to_env
    content: |
      Confirm and verify (with a test) that when no Claude Code OAuth credential exists for the workspace owner, the composite auth service falls through to `EnvHarnessAuthService` and emits `ANTHROPIC_API_KEY` if the env var is set — mirroring today's Codex behaviour. Today's `EnvHarnessAuthService.HARNESS_ENV_KEYS["claude-code"] = "ANTHROPIC_API_KEY"` already exists, so the fallback should be automatic once `harness_provider_mapping` is done. Add a regression test in `HarnessAuthService.test.ts` for both branches: (a) Claude Code OAuth present → files-and-env artifact, (b) OAuth absent, env set → api-key artifact, (c) both absent → `kind: "none"`.
    status: pending
  - id: decision_doc_and_agents_md
    content: |
      Add `docs/decisions/claude-code-oauth-via-mal-cli.md`. Use the existing `docs/decisions/codex-oauth-via-mal-cli.md` as a template. Cover at minimum:

      - Why a stdin-paste flow instead of a localhost callback (Anthropic's redirect_uri is platform.claude.com, the user must copy the displayed `<code>#<state>` value).
      - Why a spoofed `claude-cli/<version> (external, cli)` User-Agent on calls to `https://platform.claude.com/v1/oauth/token` (Anthropic rejects requests without it; the OpenCode plugin does the same).
      - Why the chosen scope set drops `org:create_api_key` from the real `claude auth login` scopes (we don't want MAL to mint API keys on the user's behalf) and adds `user:file_upload` and `user:mcp_servers` (Claude Code's own startup paths exercise them).
      - The per-provider `shouldRefresh` policy: Codex keeps the 7-day lastRefresh rule; Anthropic refreshes within one hour of `expires_at`.
      - The harness fallback (workspace-owner OAuth → `ANTHROPIC_API_KEY` env).
      - Sandbox materialization path `/root/.claude/.credentials.json` with the `claudeAiOauth` shape (cite the credentials format reference).
      - The acknowledged risk that Anthropic may break this flow at any time (the User-Agent gate and the entire third-party-OAuth path are not officially supported).

      Update `docs/ideas/oauth-for-providers.md` so the existing "first implemented slice" note also points to this new decision doc (currently only points to the Codex doc).

      Update `apps/mal-cli/AGENTS.md` to list `mal providers login claude-code` and `mal providers logout claude-code` under the Commands section, and to extend the Manual smoke test with a Claude Code dry-run.
    status: pending
  - id: typecheck_and_check
    content: |
      Run `pnpm typecheck` and `pnpm check` from the repo root and resolve any issues introduced by the plan. Pay particular attention to the union-widening of `OAuthProviderId` and `HarnessCredentialProviderId` — exhaustiveness checks elsewhere in the codebase will surface here.
    status: pending
isProject: false
---

## Goal

Let users grant MAL access to their Anthropic Claude subscription so the Claude Code harness can run under their subscription's quota instead of an API key. The credential is brokered by the local `mal` CLI (the OAuth happens on the user's own machine, not the MAL server), uploaded to the server, encrypted at rest, and materialized into the sandbox as `~/.claude/.credentials.json` at run time. When the user has no OAuth credential stored, the harness falls back to `ANTHROPIC_API_KEY` from the server environment exactly as it does today.

This mirrors the existing Codex OAuth pattern (`docs/decisions/codex-oauth-via-mal-cli.md`) but with three substantive differences forced by Anthropic's flow:

1. The redirect URI is a remote URL (`https://platform.claude.com/oauth/code/callback`), so the CLI cannot run a local callback listener. Instead the user copies the `<code>#<state>` value the browser displays and pastes it into the CLI. The CLI does the token exchange itself.
2. The token endpoint requires a `User-Agent: claude-cli/<version> (external, cli)` header. Anthropic rejects requests from clients that don't look like the real Claude Code CLI. This is a moving target — the `claude-cli` version is pinned in code and overridable via env.
3. Anthropic access tokens expire ~8 hours after issue (verified by inspecting a real `~/.claude/.credentials.json` produced by `claude` in a container), so the server-side "refresh if stale" rule must look at `expires_at` from the token bundle, not `lastRefresh` from the row. A one-hour pre-expiry buffer is well clear of the cliff and trivial to refresh.

## Background

### Current state — Codex OAuth pattern

The Codex OAuth flow is implemented end-to-end in this repo and is the template for this work. The relevant pieces:

- **CLI** (`apps/mal-cli`): `mal login` does PKCE OAuth against MAL's Better Auth OIDC issuer; `mal providers login codex` runs the OpenAI Codex OAuth flow on a localhost callback (`http://localhost:1455/auth/callback`) and uploads the resulting tokens to MAL via `PUT /api/me/harness-credentials/openai-codex`. CLI auth state lives at `${XDG_CONFIG_HOME:-~/.config}/mal/auth.json`; provider tokens never persist to disk locally.
- **Server provider abstraction** (`apps/server/src/oauth-providers/`): `OAuthProvider` interface with `tokenEndpoint`, `tokenBundleSchema`, `refreshTokens(stored)`, `materializeForSandbox(stored)`. `OpenAiCodexProvider` is the only impl. `OAuthProviderId` is currently a single literal `"openai-codex"`.
- **Server storage** (`apps/server/src/user-oauth-credentials/`): `user_harness_oauth_credentials` table keyed `(userId, providerId)`, encrypted with `SaltedEncryptionService` using `OAUTH_CREDENTIALS_ENCRYPTION_KEY`. The `providerId` column is plain text, so no schema migration is needed for new providers.
- **Server upload handler** (`apps/server/src/me/me-handlers.ts`): `PUT /api/me/harness-credentials/:providerId` parses the body, calls `parseChatGptJwt(access_token)` inline, validates with `openAiCodexTokenBundleSchema`, and upserts. This is hardcoded to Codex today and is the main thing the refactor needs to generalise.
- **Harness resolution** (`apps/server/src/harness/HarnessAuthService.ts`): `CompositeHarnessAuthService.getAuthArtifacts(harnessId, ctx)` has a hardcoded `if (harnessId !== "codex-cli") fallback…` check. When it is `codex-cli` and the workspace owner has a stored credential, it decrypts, refreshes if stale (`now - lastRefresh > 7 days`), and calls `provider.materializeForSandbox`. Otherwise it falls through to `EnvHarnessAuthService` which emits the appropriate `*_API_KEY` env var.
- **Harness materialization** (`apps/server/src/harness/CodexCliHarness.ts`): receives `auth.kind === "files-and-env"` and threads `auth.files` into the sandbox mount list and `auth.env` into the run env.

### Critical differences for Claude Code

| | Codex | Claude Code |
|---|---|---|
| Redirect URI | `http://localhost:1455/auth/callback` | `https://platform.claude.com/oauth/code/callback` (remote — user copy-pastes) |
| Token endpoint encoding | `application/x-www-form-urlencoded` | `application/x-www-form-urlencoded` (same; existing helper works) |
| Required User-Agent | none | `claude-cli/<version> (external, cli)` — Anthropic rejects requests without it |
| Access token | signed JWT (we extract `chatgpt_account_id`) | opaque `sk-ant-oat01-…` string (no account id available) |
| Access token lifetime | hours, refresh policy is `lastRefresh > 7 days` | ~8 hours (verified); refresh policy must use `expires_at` |
| Refresh token rotation | optional (`refresh_token ?? stored.refresh_token` is safe) | **rotated** — must always take the new one, never fall back to stored |
| Sandbox file | `/root/.codex/auth.json` | `/root/.claude/.credentials.json` (`claudeAiOauth` shape, `expiresAt` in ms-epoch) |

### Source of truth for the OAuth flow

This flow is not officially documented by Anthropic. Ground truth used here:

- [shahidshabbir-se/opencode-anthropic-oauth](https://github.com/shahidshabbir-se/opencode-anthropic-oauth) — OpenCode plugin that performs the same OAuth dance against the same client id. The token endpoint URL, body encoding, `User-Agent` header, code-paste parsing (split on `#`), and refresh body all come from its `src/oauth.ts`.
- [Claude Code authentication docs](https://code.claude.com/docs/en/authentication) — confirms the Linux `~/.claude/.credentials.json` path.
- [claude-code-sandbox lift-and-shift-credentials](https://git.joshthomas.dev/mirrors/claude-code-sandbox/src/commit/b44cf1a84e0bab3f5f2ded8a871cbdc43ce50249/docs/lift-and-shift-credentials.md) — confirms the `claudeAiOauth` JSON shape including `expiresAt` as ms-since-epoch.
- [docs/ideas/oauth-for-providers.md](../../docs/ideas/oauth-for-providers.md) — the in-repo reverse-engineering note that documents the authorize URL, client id, and scope sets observed from `claude setup-token` / `claude auth login`.

Anthropic has reportedly tightened up against third-party harnesses using subscription auth (OpenCode moved their Anthropic-auth implementation out into community plugin repos for this reason). The User-Agent gate is the main visible enforcement. The plan should be treated as Anthropic-dependent — if they break it, fix-forward, don't try to make this resilient to that breakage in v1.

## Design Decisions

- **Provider id is `claude-code`** (not `anthropic-claude-code` or `anthropic`). Matches the harness id directly. Trade-off: if we ever add another Anthropic-branded provider with a different OAuth shape we'll have a naming collision; that's a future-us problem.
- **Scopes match the OpenCode plugin**: `user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload`. The narrower `user:inference` set may not be sufficient for Claude Code itself to start (startup exercises sessions / MCP); the full `claude auth login` set adds `org:create_api_key` which we explicitly don't want.
- **stdin-paste UX** for v1 — print the URL, open the browser if possible, prompt for the pasted `<code>#<state>` value on stdin, validate state matches the verifier we sent. No `--code` flag in v1; can be added later if scripted use becomes a use case.
- **Server-side preemptive refresh, one-hour buffer.** Per-provider `shouldRefresh` policy: Codex keeps today's "lastRefresh older than 7 days" rule; Anthropic refreshes when `expires_at - now < 1h`. Anthropic access tokens were directly observed to live ~8 hours in a real container-issued credentials file, so a one-hour buffer leaves seven hours of headroom per refresh.
- **Fall back to `ANTHROPIC_API_KEY` env** when no Claude Code OAuth credential exists. Mirrors Codex behaviour. The Claude Code harness keeps working unchanged for users who haven't opted into the OAuth flow.
- **No background refresh job; no write-back from the running sandbox.** Same as Codex — refreshes happen at run preparation time on the server. Refreshes that Claude Code performs inside the container are lost when the container exits; this is acceptable because the next run will see an `expires_at` that's now in the past and preemptively refresh on the server.
- **Generalise the provider abstraction** rather than special-casing Anthropic. `OAuthProvider<TStored>` is parameterised, `validateUpload` moves into the interface, the harness↔provider mapping in `CompositeHarnessAuthService` becomes a `Map`, and `OAuthProviderId` becomes a union. This is more refactoring than the bare minimum but keeps future provider additions cheap.
- **User-Agent version is configurable.** Both the CLI (`MAL_ANTHROPIC_CLI_VERSION`) and the server (`ANTHROPIC_CLI_VERSION`) accept an env override. The hardcoded default is whatever Claude Code version we tested with at plan time (`2.1.139` as of writing).

## Alternatives Considered (and Rejected)

- **Localhost-callback flow via SSH port forwarding.** Doesn't help — Anthropic's authorization endpoint always redirects to `platform.claude.com`, not a configurable URI.
- **Trust Claude Code to refresh inside the sandbox.** Simpler but fails opaquely (run dies at `claude` startup, no host telemetry) and depends on Anthropic continuing to accept refreshes from arbitrary user agents. Server-side refresh is more robust and gives us a single chokepoint for the User-Agent gate.
- **Bypass OAuth and accept Claude Code's existing `~/.claude/.credentials.json` from the user's machine via a `lift-and-shift` flow** (cf. the claude-code-sandbox project). Compelling but ties MAL to whatever Claude Code's local credential storage looks like on every platform (Keychain on Mac, Credential Manager on Windows, file on Linux) and to Claude Code's refresh-and-rewrite cadence. The OAuth path is one self-contained flow MAL fully controls.
- **Single `OAuthProviderId = string`** rather than a union. Simpler, but the union catches typos at compile time in provider-specific code paths (`if (providerId === "openai-codex")`).

## Implementation Guide

The TODOs are ordered so the codebase typechecks at each step. The high-level order is:

1. **Widen the literal types and generalise the provider interface** (`widen_provider_id_union`, `parameterise_oauth_provider_interface`). This breaks a few exhaustive checks; fix as they appear. No behaviour change for Codex.
2. **Refactor the upload handler and harness resolution** to be provider-aware (`generalise_me_handlers_upload`, `harness_provider_mapping`). Still no behaviour change — Codex tests pass as-is.
3. **Implement the Anthropic provider, including the upload-side validator and the per-provider shouldRefresh policy** (`anthropic_provider_implementation`, `claude_code_provider_upload_metadata`, `preemptive_refresh_window`).
4. **Wire Claude Code harness to accept files-and-env artifacts** (`claude_code_harness_files_and_env_artifact`).
5. **Wire it all together in services** (`services_wiring`).
6. **Build the CLI side** — the paste-flow helper, the config, the User-Agent-aware exchangeToken, the login/logout commands, the router (`cli_paste_flow_helper` → `cli_command_router_and_status`).
7. **Verify the env fallback regression** (`harness_auth_fallback_to_env`).
8. **Document and ship** (`decision_doc_and_agents_md`, `typecheck_and_check`).

### Key code patterns to follow

**Provider implementation** — mirror the structure of `apps/server/src/oauth-providers/OpenAiCodexProvider.ts`:

```ts
export class OpenAiCodexProvider implements OAuthProvider {
  readonly providerId = "openai-codex" as const;
  readonly tokenEndpoint = "https://auth.openai.com/oauth/token";
  readonly tokenBundleSchema = openAiCodexTokenBundleSchema;
  async refreshTokens(stored) { /* POST tokenEndpoint with form body, parse, return */ }
  materializeForSandbox(stored) { /* return {files: [{containerPath, contents}], env: {}} */ }
}
```

**CLI command** — mirror `apps/mal-cli/src/commands/providers-login-codex.ts`:

```ts
export async function providersLoginCodex(): Promise<void> {
  await getMalAccessToken();                                  // ensure MAL CLI is logged in
  const pkce = createPkceChallenge();                          // separate state + verifier
  const authorizeUrl = buildAuthorizeUrl(config, pkce);
  const callback = await runOAuthFlow({authorizeUrl, expectedState: pkce.state, port: 1455});
  const tokenResponse = await exchangeToken(config.tokenUrl, urlencodedBody);
  await uploadCodexTokens({access_token, refresh_token, id_token});
}
```

For Claude Code, swap `runOAuthFlow` for the new `runCodePasteFlow` (no port, no listener — just stdin), add the User-Agent header to `exchangeToken`, and call the Claude-Code upload helper. The shape is otherwise identical.

**Sandbox file materialization** — `OpenAiCodexProvider.materializeForSandbox` shows the pattern; Anthropic's version emits the `claudeAiOauth`-wrapped shape.

**Upload validation delegation** — the current PUT handler in `me-handlers.ts` lines 72–93:

```ts
const accountId = await parseChatGptJwt(ctx.body.tokens.access_token);
if (!accountId.success) return badUserInput("Access token is not a valid ChatGPT JWT.");
const tokenBundle = openAiCodexTokenBundleSchema.safeParse({...ctx.body.tokens, account_id: accountId.value});
if (!tokenBundle.success) return badUserInput("Harness credential tokens are invalid.");
```

becomes:

```ts
const provider = oauthProviders[providerId];
const validated = await provider.validateUpload(ctx.body.tokens);
if (!validated.success) return badUserInput(validated.error.issues[0] ?? "Harness credential tokens are invalid.");
// then upsert JSON.stringify(validated.value)
```

Codex's `validateUpload` impl wraps the existing JWT + schema check. Anthropic's checks prefixes and reads optional `expires_at` / `scopes` from the request body.

## Edge Cases and Error Handling

- **Mismatched state on paste.** The CLI should reject before hitting the token endpoint with a clear error (`OAuth callback state did not match.`). Don't proceed with a possibly-CSRF-attacker-supplied code.
- **Pasted value with no `#`.** Treat the whole string as the code (no state validation). Matches the OpenCode plugin's parser. Note in the prompt that the format is `<code>#<state>` so users with malformed pastes get a friendlier error.
- **Token endpoint 401/403 from User-Agent gating.** Surface a hint that the Claude Code CLI version may have drifted and the override env vars (`MAL_ANTHROPIC_CLI_VERSION` / `ANTHROPIC_CLI_VERSION`) can be bumped. Don't silently retry.
- **Refresh response missing `refresh_token`.** Anthropic rotates refresh tokens — a missing field in the response is a server bug, not an indicator to keep the old one. Treat as `invalid-token-response`.
- **`expires_at` in the past at run prep.** Refresh policy still triggers (one-hour rule covers this). If refresh fails, `getCodexOAuthArtifacts` style fallthrough to `kind: "none"` lets the env fallback take over.
- **No `ANTHROPIC_API_KEY` env and no OAuth credential.** Same as Codex today — `getAuthArtifacts` returns `kind: "none"`, harness gets no auth, the run will fail loudly inside `claude` itself. Acceptable; the availability surface tells the UI to disable the harness anyway.
- **Concurrent uploads.** The repository's `onConflictDoUpdate` already handles last-write-wins per `(userId, providerId)`. No new locking needed.
- **CLI offline / browser unavailable.** The CLI prints the URL before attempting `openBrowser`, so users without a graphical environment can still copy the URL by hand.

## Out of Scope

- A `--code` flag for scripted, non-interactive login. Add later if demand exists.
- A `mal providers login` interactive picker that asks which provider to log into. Each provider gets its own subcommand for now.
- Background server-side refresh (cron/queue). Run preparation is the only refresh trigger; if the user goes months without running a task the refresh token may expire and they'll need to re-login. Acceptable for v1.
- Capturing refresh-token updates Claude Code performs inside the sandbox. Same trade-off the Codex flow has today.
- Multi-account / multi-workspace policy for Claude Code credentials. Continues to use the workspace creator's credential, mirroring Codex.
- Frontend UI for managing the credential. v1 management is CLI-only (`mal status`, `mal providers login claude-code`, `mal providers logout claude-code`).
- Provider revocation on logout. Local + server delete only, no call to Anthropic's token revocation endpoint.
- Telemetry for refresh failures. If refresh starts failing in production we'll find out from runs failing at startup; instrumenting the refresh path is a future enhancement.
