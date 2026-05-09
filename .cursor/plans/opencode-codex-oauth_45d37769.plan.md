---
name: opencode-codex-oauth
overview: Let the OpenCode harness reuse the existing OpenAI Codex OAuth credential to unlock GPT-5 models inside OpenCode. Phase 0 refactors the harness layer into per-harness subdirectories with their own auth services (no behavior change) so the rest of the work has a clean home. Phase 1 adds the Codex OAuth source to OpenCodeAuthService and exposes two OpenAI-backed models. Phase 2 adds per-model auth-source metadata, server-side filtering, frontend chip indicators, and write-time validation so OpenAI models only appear when the workspace creator has the Codex OAuth credential.
todos:
  - id: harness_auth_interface_trim
    content: Trim HarnessAuthService to a per-harness shape — drop the harnessId parameter from every method, define HarnessAvailability with `sources: ReadonlyArray<HarnessAuthSource>` (not a single `source`), and define a discriminator type `HarnessAuthSource = "env" | "workspace-owner-oauth"`. Keep apps/server/src/harness/HarnessAuthService.ts as the home for the interface and shared types only. Behavior of consumers does not change in this todo — concrete implementations are introduced in subsequent todos.
    status: pending
  - id: oauth_credential_resolver
    content: Extract the Codex OAuth refresh-and-persist logic out of CompositeHarnessAuthService into apps/server/src/oauth-providers/OpenAiCodexCredentialResolver.ts. The resolver takes the UserOAuthCredentialRepository and the OpenAiCodexProvider as deps and exposes `getFreshTokensForUser(userId): Promise<StoredOAuthTokens | null>` (null when no credential row exists; refreshes lazily and persists if the refresh produced new tokens). Move the existing 7-day staleness check here. Add unit tests covering: no credential, fresh credential (no refresh), stale credential (refresh + persist), refresh failure (current behavior — propagate or fallback, mirror today).
    status: pending
  - id: provider_split_materialization
    content: Split OpenAiCodexProvider.materializeForSandbox(stored) into two pure functions — `materializeForCodex(tokens: StoredOAuthTokens): { files, env }` keeps emitting the existing /root/.codex/auth.json shape, and the staleness/refresh half is gone (now lives in the resolver). Update the existing OpenAiCodexProvider tests to reflect the split.
    status: pending
  - id: claude_code_subdir
    content: Create apps/server/src/harness/claude-code/ and move ClaudeCodeHarness.ts into it (renaming imports). Add ClaudeCodeAuthService.ts implementing the trimmed HarnessAuthService interface — single env-API-key check on ANTHROPIC_API_KEY, returning api-key artifact when set, none otherwise. getAvailability returns sources: ["env"] when set, [] when not. Add ClaudeCodeAuthService.test.ts covering both branches.
    status: pending
  - id: cursor_cli_subdir
    content: Create apps/server/src/harness/cursor-cli/ and move CursorCliHarness.ts into it. Add CursorCliAuthService.ts mirroring the env-API-key shape from the existing EnvHarnessAuthService logic for cursor-cli (today: ANTHROPIC_API_KEY). Add CursorCliAuthService.test.ts.
    status: pending
  - id: codex_cli_subdir
    content: Create apps/server/src/harness/codex-cli/ and move CodexCliHarness.ts and CodexCliHarness.test.ts into it. Add CodexCliAuthService.ts that depends on OpenAiCodexCredentialResolver and the env shape — prefers the workspace-owner Codex OAuth artifact when the credential exists, falls back to OPENAI_API_KEY env. getAvailability sources reflects which credential is in play (["workspace-owner-oauth"] | ["env"] | []). Behavior must match today's CompositeHarnessAuthService Codex branch exactly. Migrate the relevant scenarios from HarnessAuthService.test.ts into a new CodexCliAuthService.test.ts.
    status: pending
  - id: opencode_subdir
    content: Create apps/server/src/harness/opencode/ and move OpenCodeHarness.ts into it. Add OpenCodeAuthService.ts implementing the current behavior unchanged — env-API-key path for OPENROUTER_API_KEY producing an api-key artifact (or composing the today-shape auth.json). Phase 0 is a strict 1:1 of current behavior; OAuth multi-source comes in Phase 1. Add OpenCodeAuthService.test.ts. Co-locate any OpenCode-specific helpers that get added in Phase 1 here too.
    status: pending
  - id: services_registry
    content: Replace the single `harnessAuthService` slot in the services DI (apps/server/src/services.ts and the FakeServices used in tests) with `harnessAuthServices: Record<AgentHarnessId, HarnessAuthService>`. Wire each per-harness service into the registry at the composition root. The registry is the only thing handlers see.
    status: pending
  - id: validate_agent_config_registry
    content: Update validateAgentConfig to take the registry (or a `HarnessAuthService` looked up by harnessId at the call site) instead of the old single-service shape. Update its callers in projects/tasks/workspaces handlers to do the lookup. Behavior must be identical to today (still rejects when the harness's availability says false).
    status: pending
  - id: handlers_registry_lookup
    content: Update projects-handlers.ts, tasks-handlers.ts, workspaces-handlers.ts (and their tests) to consume `harnessAuthServices[harnessId]` rather than `harnessAuthService.method(harnessId, ctx)`. The workspaces.harnesses.GET endpoint that loops over all harnesses now loops over the registry. Test fakes update accordingly — replace the single mock auth service with a Record of mocks. Existing test scenarios pass unchanged.
    status: pending
  - id: delete_composite_and_env_services
    content: Delete CompositeHarnessAuthService and EnvHarnessAuthService (and HarnessAuthService.test.ts where it tested those classes specifically). All scenarios that were tested there now live in per-harness service tests. Update apps/server/src/harness/index.ts barrel exports to surface the new structure.
    status: pending
  - id: opencode_auth_helper
    content: Add apps/server/src/harness/opencode/opencode-auth.ts exporting composeOpenCodeAuthJson(sources), the OPENCODE_AUTH_PATH constant, the OpenCodeAuthSource discriminated union, and a parseExpiresMsFromAccessToken(jwt) helper for converting Codex access-token exp claims into the unix-ms shape OpenCode's auth.json wants. Pure functions, no IO. Tests cover all source combinations (none, only openrouter, only openai-oauth, both) and JWT exp parsing edge cases.
    status: pending
  - id: opencode_auth_service_oauth_source
    content: Extend OpenCodeAuthService to inject OpenAiCodexCredentialResolver and assemble its auth artifact from up to two sources — OPENROUTER_API_KEY (env) and the workspace owner's Codex OAuth tokens (resolver). Compose a single files-and-env artifact via composeOpenCodeAuthJson, written to OPENCODE_AUTH_PATH. When neither source is available, return { kind: "none" } so OpenCode still runs anonymously. getAvailability returns the array of detected sources; isAvailable stays true (free models always work). Add tests for the four source combinations.
    status: pending
  - id: opencode_harness_files_and_env
    content: Update OpenCodeHarness.prepare() to accept "files-and-env" artifacts. When supplied, take the auth.json file from auth.files verbatim (paired with the harness's own opencode.json config) and merge auth.env into the preparation env. The "api-key" branch is removed — composition is the auth service's job now. The "none" branch still emits an empty `{}` auth.json so the binary starts cleanly. Update OpenCodeHarness tests.
    status: pending
  - id: opencode_harness_models_phase1
    content: Add two entries to OpenCodeHarness.models — { id: "openai/gpt-5.4-mini", displayName: "GPT-5.4 Mini" } and { id: "openai/gpt-5.5", displayName: "GPT-5.5" }. Confirm getRunCommand passes --model=<modelId> (add it if missing). Phase 1 stops here; the new models will appear in the dropdown unconditionally and fail at runtime for users without Codex auth — Phase 2 closes that gap.
    status: pending
  - id: model_required_auth_metadata
    content: Add `requiredAuth?: HarnessAuthSource | null` to HarnessModel in apps/server/src/harness/AgentHarness.ts and mirror it through packages/api/src/harnesses/harnesses-model.ts. The two new OpenCode openai/* entries declare requiredAuth = "workspace-owner-oauth". All other harness models (across every harness) leave it undefined; per the user's call we are NOT backfilling Cursor / Claude / Codex CLI models in this plan.
    status: pending
  - id: model_availability_in_listing
    content: Update workspaces-handlers.ts harnesses.GET so each model in the response payload carries an isAvailable boolean. Compute the availability from the harness's getAvailability(ctx).sources — model.isAvailable = model.requiredAuth == null || sources.includes(model.requiredAuth). Surface isAvailable (and optionally requiredAuth) on the API model schema in packages/api. Tests in workspaces-handlers.test.ts for both directions.
    status: pending
  - id: validate_agent_config_model_check
    content: Extend validateAgentConfig (now operating on a single HarnessAuthService passed in) to also reject configs whose selected modelId points at an unavailable model. Look up the model on the harness, compute the same source-set, reject if requiredAuth is unmet. Error copy mirrors the existing harness-level message — `Agent harness model "<modelId>" is not available (credentials not configured).`. Add tests; update the projects/tasks/workspaces handler tests that exercise agent-config writes to cover model-level rejection.
    status: pending
  - id: frontend_model_filter_and_chip
    content: Update apps/frontend/app/components/ui/HarnessSelect.tsx (and any model-select consumers) to hide models with isAvailable === false and render a small chip after each model display name showing its auth source — "Free" for null, "Codex auth" for workspace-owner-oauth, "API key" for env. Add a one-line empty-state hint under OpenCode when its auth-gated models were filtered out, linking to the providers settings page (`Connect OpenAI to unlock GPT-5 models in OpenCode`). Chip strings come from a small lookup map so they're easy to extend.
    status: pending
  - id: tests_phase2
    content: Backend tests for per-model isAvailable in workspaces-handlers (workspace with Codex OAuth → openai/* visible; without → hidden), and for validateAgentConfig rejecting an unavailable model. Frontend component tests for chip rendering and filter behavior in HarnessSelect.
    status: pending
isProject: false
---

## Goal

Make the existing OpenAI Codex OAuth credential do double duty: in addition to powering the Codex CLI harness, it should unlock OpenAI GPT-5 models inside the OpenCode harness. OpenCode keeps its always-available free models (`opencode/big-pickle`, `opencode/minimax-m2.5-free`); the OpenAI-backed models (`openai/gpt-5.4-mini`, `openai/gpt-5.5`) only appear when the workspace creator has stored a Codex OAuth credential.

The work is split into three phases:

- **Phase 0 — refactor.** Reshape the harness layer so each harness lives in its own subdirectory with its own auth service. This is a strict 1:1 conversion of existing behavior; no user-visible changes. Done first because the rest of the work has a much cleaner home in this shape, and putting it last would mean refactoring around code we just wrote.
- **Phase 1 — credential plumbing.** Add the Codex OAuth source to OpenCodeAuthService and add two OpenAI-backed models to OpenCode's static model list. After Phase 1 the new models appear in the dropdown unconditionally; users without Codex auth will see them fail at runtime (same failure mode Codex CLI has today, acceptable as a transitional state).
- **Phase 2 — UX.** Per-model `requiredAuth` metadata, server-side per-model availability, write-time validation, and a frontend chip + filter so unavailable models stop appearing and visible models advertise which credential they use.

## Background

- The OAuth credential is stored once per user under `provider_id = "openai-codex"`. Today it materializes as `~/.codex/auth.json` for Codex CLI. The same tokens are interchangeable for OpenCode's "ChatGPT Plus/Pro (Codex Subscription)" auth path — only the file shape and location differ.
- OpenCode reads auth from `/root/.local/share/opencode/auth.json` (path inside the sandbox container). The file is a flat JSON object keyed by provider name, each value being either `{ "type": "api", "key": "..." }` or `{ "type": "oauth", "refresh", "access", "expires", "accountId" }`. Multiple providers can coexist in one file.
- OpenCode model IDs are provider-prefixed (`opencode/...`, `openai/...`, `openrouter/...`, `lmstudio/...`). The prefix encodes which entry in auth.json the model needs, which makes per-model auth requirements declarative rather than computed.
- The current `HarnessAuthService` interface is keyed on `harnessId` — every method takes it as a parameter — and the only non-trivial implementation, `CompositeHarnessAuthService`, dispatches internally on `harnessId` via an `if`-chain. That shape breaks down as harness-specific specialization grows. Phase 0 fixes the shape.

## Architectural decisions

### Per-harness auth services in per-harness subdirectories (Phase 0)

The harness directory is reshaped from a flat `apps/server/src/harness/*.ts` layout into per-harness subdirectories:

```
apps/server/src/harness/
  AgentHarness.ts                        # interfaces + types stay here
  AgentHarnessConfigRepository.ts        # cross-harness, stays
  HarnessAuthService.ts                  # interface only (no implementations)
  validateAgentConfig.ts                 # called by handlers, stays
  index.ts                               # barrel re-exports

  claude-code/
    ClaudeCodeHarness.ts
    ClaudeCodeAuthService.ts
    ClaudeCodeAuthService.test.ts

  codex-cli/
    CodexCliHarness.ts
    CodexCliHarness.test.ts
    CodexCliAuthService.ts
    CodexCliAuthService.test.ts

  cursor-cli/
    CursorCliHarness.ts
    CursorCliAuthService.ts
    CursorCliAuthService.test.ts

  opencode/
    OpenCodeHarness.ts
    OpenCodeAuthService.ts
    OpenCodeAuthService.test.ts
    opencode-auth.ts            # added in Phase 1
    opencode-auth.test.ts       # added in Phase 1
```

The trimmed `HarnessAuthService` interface drops `harnessId` from every method:

```ts
type HarnessAuthSource = "env" | "workspace-owner-oauth";

type HarnessAvailability = {
  isAvailable: boolean;
  sources: ReadonlyArray<HarnessAuthSource>;
};

interface HarnessAuthService {
  getAvailability(ctx: HarnessAuthContext): Promise<HarnessAvailability>;
  getAuthArtifacts(ctx: HarnessAuthContext): Promise<HarnessAuthArtifacts>;
}
```

`CompositeHarnessAuthService` and `EnvHarnessAuthService` are deleted. Each per-harness service implements the interface directly.

### Shared OAuth credential resolution

`OpenAiCodexCredentialResolver` (new file in `apps/server/src/oauth-providers/`) wraps the credential repo + the existing `OpenAiCodexProvider` and exposes `getFreshTokensForUser(userId): Promise<StoredOAuthTokens | null>`. Internally it does the lookup, runs the existing 7-day staleness refresh, and persists if tokens changed. This is the chunk of `getCodexOAuthArtifacts` that doesn't depend on file shape.

Both `CodexCliAuthService` and (in Phase 1) `OpenCodeAuthService` consume this resolver. Neither auth service knows about the credential repo or the provider's HTTP refresh — they just ask "give me fresh tokens for this user."

### Services registry

The DI shape changes from `services.harnessAuthService: HarnessAuthService` to `services.harnessAuthServices: Record<AgentHarnessId, HarnessAuthService>`. Handlers look up the right service by id at the call site:

```ts
const authService = ctx.services.harnessAuthServices[harnessId];
const availability = await authService.getAvailability(authContext);
```

The workspaces `.harnesses.GET` endpoint that lists every harness now iterates the registry. `validateAgentConfig` takes a single auth service (the one that matches `agentConfig.harnessId`) plus the harness instance.

### Multi-source artifact composition lives in the OpenCode harness's directory

When OpenCode has both `OPENROUTER_API_KEY` (env) and Codex OAuth (DB), the produced auth.json must contain both sections. Composition logic lives in `apps/server/src/harness/opencode/opencode-auth.ts` — a pure helper alongside `OpenCodeAuthService`. The auth artifact stays a plain `files-and-env`; nothing about the artifact contract changes.

`HarnessAvailability.sources` (an array, established in Phase 0) honestly reports which credentials are in play for OpenCode (`[]`, `["env"]`, `["workspace-owner-oauth"]`, or both).

### Per-model `requiredAuth`, declared statically

Phase 2 adds an optional `requiredAuth?: HarnessAuthSource | null` field on `HarnessModel`. The new OpenCode `openai/*` entries set it to `"workspace-owner-oauth"`; `opencode/*` entries omit it. We do **not** backfill the field on Cursor / Claude / Codex CLI models — those harnesses gate at the harness level today and per-model gating adds nothing for them.

### Validation runs at agent-config write time and at the listing endpoint

`validateAgentConfig` already rejects configs for unavailable harnesses. Phase 2 extends it to also reject configs whose `modelId` points at a model whose `requiredAuth` isn't satisfied by the workspace's available sources. The same source-availability calculation drives both the listing endpoint's per-model `isAvailable` and the validation rejection.

## Phase 0 — refactor (no behavior change)

**Goal:** reshape the harness layer so each harness owns its auth. Strict 1:1 conversion of today's behavior; no new features, no semantic changes.

Order of work mirrors the todos:

1. **Trim `HarnessAuthService`** — drop `harnessId` from every method, change `source` to `sources: ReadonlyArray<HarnessAuthSource>`. Pure type changes; existing implementations get errors that the next todos resolve.
2. **Extract `OpenAiCodexCredentialResolver`** — into `apps/server/src/oauth-providers/`. The existing `getCodexOAuthArtifacts` flow is split into "resolve fresh tokens" (resolver) and "shape into Codex file" (provider). Tests move with the logic.
3. **Split `OpenAiCodexProvider.materializeForSandbox`** — into `materializeForCodex(tokens)` (the existing file shape) and remove the refresh-and-persist half (now in resolver).
4. **Create per-harness subdirectories** (claude-code/, cursor-cli/, codex-cli/, opencode/) — move existing harness files; add per-harness auth service files. Each auth service implements the trimmed interface and replicates today's behavior. The `EnvHarnessAuthService` switch by harness becomes individual env checks inside each service. The `CompositeHarnessAuthService` Codex branch becomes `CodexCliAuthService`'s OAuth-preferred resolution.
5. **Replace `harnessAuthService` with a registry** — `services.harnessAuthServices: Record<AgentHarnessId, HarnessAuthService>`. Wire at the composition root.
6. **Update `validateAgentConfig` and handlers** — every call site moves from `harnessAuthService.method(harnessId, ctx)` to `harnessAuthServices[harnessId].method(ctx)`. The workspaces listing endpoint loops over the registry.
7. **Delete `CompositeHarnessAuthService` + `EnvHarnessAuthService`** — and the parts of `HarnessAuthService.test.ts` that tested them. All scenarios now live in per-harness service tests.
8. **Update test fakes** — every fake/mock of `harnessAuthService` becomes a Record. Where the test only cares about one harness's behavior, the fake registry only populates that key.

Phase 0 ships when:
- `pnpm typecheck` is clean.
- `pnpm test` is green.
- No call site references `CompositeHarnessAuthService` / `EnvHarnessAuthService`.
- The workspaces handler test still asserts the full list of harnesses with their availability — proving the registry-loop works end to end.

## Phase 1 — credential plumbing (Codex OAuth → OpenCode)

**Goal:** the Codex OAuth credential reaches OpenCode's auth.json. Two new OpenAI models appear in OpenCode's static model list. No filtering yet.

### 1.1 OpenCode auth helper (`apps/server/src/harness/opencode/opencode-auth.ts`)

Pure functions, no IO.

- `OPENCODE_AUTH_PATH = "/root/.local/share/opencode/auth.json"` constant.
- `OpenCodeAuthSource` discriminated union — one variant per provider key we know how to emit:
  ```ts
  type OpenCodeAuthSource =
    | { kind: "openrouter-api-key"; apiKey: string }
    | { kind: "openai-oauth"; tokens: OpenAiOAuthTokens };

  type OpenAiOAuthTokens = {
    accessToken: string;
    refreshToken: string;
    accountId: string;
    expiresAtMs: number;
  };
  ```
- `composeOpenCodeAuthJson(sources): string` — emits the JSON OpenCode expects:
  ```json
  {
    "openrouter": { "type": "api", "key": "..." },
    "openai":     { "type": "oauth", "refresh": "...", "access": "...", "expires": 1774433969205, "accountId": "..." }
  }
  ```
  Empty input returns `"{}"`.
- `parseExpiresMsFromAccessToken(jwt): number` — base64url-decode payload, read `exp`, multiply by 1000. Throws on malformed token.

### 1.2 Extend `OpenCodeAuthService`

Inject `OpenAiCodexCredentialResolver` into the service.

`getAuthArtifacts(ctx)`:
- Build a `sources: OpenCodeAuthSource[]` from whatever's available:
  - If `OPENROUTER_API_KEY` env is set → `{ kind: "openrouter-api-key", apiKey }`.
  - If `ctx.kind === "workspace-owner"` and `resolver.getFreshTokensForUser(ctx.workspaceOwnerUserId)` returns tokens → `{ kind: "openai-oauth", tokens }` (where `expiresAtMs` is computed via `parseExpiresMsFromAccessToken`).
- If sources is non-empty: return `{ kind: "files-and-env", files: [{ containerPath: OPENCODE_AUTH_PATH, contents: composeOpenCodeAuthJson(sources) }], env: {} }`.
- If sources is empty: return `{ kind: "none" }` — OpenCode still starts cleanly; only free models will work.

`getAvailability(ctx)`:
- Compute the same source set; return `{ isAvailable: true, sources: <detected> }`. OpenCode is always available because free models always work; the `sources` array tells the truth about which credentials are in play.

### 1.3 OpenCodeHarness changes

- `prepare()` accepts `kind: "files-and-env" | "none"` only. The `api-key` case is removed because composition now lives in `OpenCodeAuthService`.
  - For `files-and-env`: take the auth.json file from `auth.files` (the entry whose containerPath matches `OPENCODE_AUTH_PATH`), pair with the harness's own opencode.json config.
  - For `none`: emit `auth.json` containing `"{}"`.
- Add to `models`:
  ```ts
  { id: "openai/gpt-5.4-mini", displayName: "GPT-5.4 Mini" },
  { id: "openai/gpt-5.5",      displayName: "GPT-5.5" },
  ```
- Confirm `getRunCommand(modelId)` passes `--model=<modelId>` when set; add the wiring if missing.

### 1.4 Phase 1 user-visible state

- A workspace with Codex OAuth: `openai/gpt-5.4-mini` and `openai/gpt-5.5` work, billed against the workspace creator's ChatGPT subscription.
- A workspace without Codex OAuth: those two models appear in the dropdown but fail at runtime. Free models work.

The dropdown-shows-but-runtime-fails state is an explicit, transient outcome of shipping Phase 1 alone. Phase 2 closes it.

## Phase 2 — per-model availability + UI

**Goal:** OpenAI models in OpenCode only appear in the dropdown when the workspace can actually use them, and a small chip on each model row tells the user which credential is being used.

### 2.1 Per-model `requiredAuth` metadata

In `apps/server/src/harness/AgentHarness.ts`:

```ts
type HarnessModel = {
  id: string;
  displayName: string;
  requiredAuth?: HarnessAuthSource | null;
};
```

Mirror through `packages/api/src/harnesses/harnesses-model.ts`. The two new OpenCode entries set `requiredAuth: "workspace-owner-oauth"`. No other harness models change.

### 2.2 Listing endpoint — per-model `isAvailable`

In `apps/server/src/workspaces/workspaces-handlers.ts` (`.harnesses.GET`):

For each harness, fetch availability once via the registry; for each model, set `isAvailable = model.requiredAuth == null || availability.sources.includes(model.requiredAuth)`. Return `isAvailable` (and optionally `requiredAuth`) per model in the API response. Update the schema in packages/api accordingly.

### 2.3 Write-time validation

In `apps/server/src/harness/validateAgentConfig.ts`:

After the existing harness-availability check, if `agentConfig.modelId !== null`, look up the model on the harness, compute the same source-set, and reject if `requiredAuth` isn't satisfied. Error message: `Agent harness model "<modelId>" is not available (credentials not configured).`

### 2.4 Frontend chip + filter

In `apps/frontend/app/components/ui/HarnessSelect.tsx` (and any other model picker):

- Filter out models with `isAvailable === false`.
- For each visible model, render a chip showing its auth source — `Free` (null), `Codex auth` (workspace-owner-oauth), `API key` (env). Strings come from a small lookup map.
- If OpenCode is shown but its auth-gated models were filtered out, render a one-line empty-state hint: `Connect OpenAI to unlock GPT-5 models in OpenCode.` with a link to the providers settings page.

### 2.5 Phase 2 user-visible state

- A workspace with Codex auth sees both free and OpenAI models, each labelled. GPT-5 selections work.
- A workspace without Codex auth sees only the free models in OpenCode, plus a hint pointing at provider settings. Picking a model that would fail at runtime is no longer possible.
- An API client writing an agent config for an unavailable model is rejected with the standard credentials-not-configured message.

## Risks & open items

- **OpenCode model IDs** — confirmed as `openai/gpt-5.4-mini` and `openai/gpt-5.5`. If OpenCode renames these (e.g. tier-suffixed `-medium`), the static list will need an update.
- **`expires` clock** — JWT `exp` is authoritative; OpenCode's own logic refreshes via the `refresh` token when its `expires` passes. We just need to write a value ≥ the actual expiry.
- **Concurrent harness runs** — both CodexCliAuthService and OpenCodeAuthService consume the same resolver. The resolver serializes refresh-and-persist via the credential repo (existing behavior); no new race.
- **ChatGPT subscription ToS** — same caveat as Codex CLI today: subscription OAuth is "for individual coding," not multi-user/commercial use. No code change for this; leave a brief comment near `composeOpenCodeAuthJson`.
- **Phase 0 scope discipline** — the temptation while in there is to also rename `HarnessAuthArtifacts`, redo `validateAgentConfig`'s shape, etc. Resist. Phase 0 must be a strict 1:1 of today's behavior or it stops being a safe refactor.

## Out of scope

- Backfilling `requiredAuth` on Cursor / Claude / Codex CLI models.
- New auth source labels beyond `env` and `workspace-owner-oauth`.
- Deeper UI redesign of the harness picker (grouping by source, sectioned headers, etc.).
- Removing the bubblewrap Dockerfile install or pinning the OpenCode CLI version.
- Auditing/logging which auth source was actually used at runtime (the `sources` array surfaces this in the metadata layer; runtime telemetry is a separate concern).
