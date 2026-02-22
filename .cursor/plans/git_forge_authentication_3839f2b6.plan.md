---
name: Git Forge Authentication
overview: Add per-project git forge authentication (starting with GitLab, designed for GitHub too) with encrypted token storage, authenticated git operations, forge API access via MCP tools, and workflow automation for creating merge requests.
todos:
  - id: encryption-service
    content: Create EncryptionService (AES-256-GCM) and add FORGE_ENCRYPTION_KEY to env schema
    status: pending
  - id: db-schema
    content: Add forgeType + forgeBaseUrl columns to projects table, create project_forge_secrets table for encrypted tokens (human creates migration)
    status: pending
  - id: forge-credential-repo
    content: Create ForgeSecretRepository with encrypt-on-write / decrypt-on-read for the secrets table
    status: pending
  - id: forge-abstraction
    content: Define GitForgeService (generic) and common model types (MergeRequest, Pipeline, PipelineJob), plus runtime-tagged forge-specific ID types
    status: pending
  - id: gitlab-service
    content: Implement GitLabService with rich GitLab-specific types (GitLabMergeRequest, GitLabPipeline, etc.) using GitLab REST API v4
    status: pending
  - id: github-service-stub
    content: Stub out GitHubService with not-implemented errors
    status: pending
  - id: forge-service
    content: Implement GitForgeService that delegates to platform-specific services and maps results to generic types
    status: pending
  - id: git-auth
    content: Modify GitService to accept and use forge credentials for clone/push/fetch
    status: pending
  - id: workflow-integration
    content: Add push-branch-and-create-mr workflow option (additive, no version bump)
    status: pending
  - id: test-connection
    content: Add test-connection API endpoint and frontend button to verify forge credentials
    status: pending
  - id: mcp-tools
    content: Add forge MCP tools (create MR, list pipelines, get job log, etc.)
    status: pending
  - id: api-changes
    content: Add forge fields to project API DTOs (write-only token, read forge type/URL/hasCredential)
    status: pending
  - id: server-handlers
    content: Update project handlers to upsert/read forge credentials
    status: pending
  - id: services-wiring
    content: Wire up new services in services.ts
    status: pending
  - id: frontend-form
    content: Add forge credential fields to project create/edit form
    status: pending
  - id: documentation
    content: Add decision document for forge authentication architecture
    status: pending
isProject: false
---

# Git Forge Authentication

## Design Decisions (confirmed)

- **Token type**: Personal Access Tokens now, designed for OAuth later
- **Credential scope**: Per-project (each project stores its own token)
- **Self-hosted**: Support configurable base URLs (e.g., `gitlab.mycompany.com`)
- **Forge API scope**: Full (git auth, MR/PR management, CI status/logs, commenting)
- **Encryption**: AES-256-GCM with a master key in env vars
- **Storage**: Hybrid -- forge config (type, base URL) on the projects table, encrypted token in a separate `project_forge_secrets` table
- **API access**: Both MCP tools (agent on-demand use) and workflow automation
- **UI**: Forge credentials alongside repository URL in project create/edit form

---

## Architecture Overview

```mermaid
graph TD
  subgraph frontend [Frontend]
    ProjectForm["ProjectForm (forge fields + test button)"]
  end

  subgraph api [API Package]
    ProjectDto["ProjectDto (includes forgeType, forgeBaseUrl)"]
    ForgeTokenInput["forgeToken (write-only, never in responses)"]
    TestEndpoint["POST test-forge-connection"]
  end

  subgraph server [Server]
    subgraph forgeLayer [Two-Layer Forge Architecture]
      GitForgeService["GitForgeService (generic types)"]
      GitLabService["GitLabService (rich GitLab types)"]
      GitHubService["GitHubService (rich GitHub types, stub)"]
    end

    subgraph crypto [Encryption]
      EncryptionService["EncryptionService (AES-256-GCM)"]
    end

    subgraph existing [Existing Services]
      GitService["GitService (now credential-aware)"]
      WorkflowExecution["WorkflowExecutionService"]
      MCPServer["MCP Server (new forge tools)"]
    end

    ForgeSecretRepo["ForgeSecretRepository"]
  end

  subgraph db [Database]
    ProjectsTable["projects table (+ forgeType, forgeBaseUrl columns)"]
    SecretsTable["project_forge_secrets table (encrypted tokens)"]
  end

  ProjectForm --> ProjectDto
  ProjectForm --> TestEndpoint
  GitForgeService --> GitLabService
  GitForgeService --> GitHubService
  ForgeSecretRepo --> EncryptionService
  ForgeSecretRepo --> SecretsTable
  GitService --> ForgeSecretRepo
  WorkflowExecution --> GitForgeService
  MCPServer --> GitForgeService
  TestEndpoint --> GitForgeService
```

---

## 1. Encryption Service

Create a general-purpose encryption utility using Node.js `crypto` with AES-256-GCM.

- New file: `apps/server/src/utils/EncryptionService.ts`
- Takes a master key (from env var `FORGE_ENCRYPTION_KEY`, 32-byte hex or base64)
- `encrypt(plaintext: string) -> string` returns `iv:ciphertext:authTag` (all base64)
- `decrypt(encrypted: string) -> string` reverses the process
- Add `FORGE_ENCRYPTION_KEY` to the env schema in [apps/server/src/env.ts](apps/server/src/env.ts)
- Use `ProtectedString` (from [apps/server/src/utils/ProtectedString.ts](apps/server/src/utils/ProtectedString.ts)) when handling decrypted tokens in memory

---

## 2. Data Model - Hybrid Approach

Forge *configuration* (type and base URL) lives on the `projects` table because it's safe to return in API responses and is part of the project's identity. Forge *secrets* (the encrypted token) live in a separate `project_forge_secrets` table to isolate sensitive data and allow future OAuth fields (refresh_token, expiry, scopes, etc.).

**Schema changes** in [apps/server/src/db/schema.ts](apps/server/src/db/schema.ts):

```typescript
const forgeTypeEnum = pg.pgEnum("forge_type", ["gitlab", "github"]);

// Add two nullable columns to the existing projectsTable:
//   forgeType: forgeTypeEnum()       -- nullable for backward compat with existing projects
//   forgeBaseUrl: pg.text()          -- nullable, e.g. "https://gitlab.com"

const projectForgeSecretsTable = pg.pgTable("project_forge_secrets", {
  id: pg.uuid().primaryKey().default(sql`uuidv7()`),
  projectId: pg.uuid().references(() => projectsTable.id).notNull().unique(),
  encryptedToken: pg.text().notNull(), // AES-256-GCM encrypted PAT
});
```

- `forgeType` and `forgeBaseUrl` are nullable on the projects table so existing projects (created before this feature) continue to work. New projects require them.
- `project_forge_secrets` is 1:1 with projects (unique constraint on `projectId`). Only queried when git/forge operations actually need the token.
- A human will create the actual migration file.

**Backward compatibility**: Existing projects in the database will have `forgeType = null` and `forgeBaseUrl = null`. They continue to use host machine git auth. The service layer `Project` type should reflect this with `forgeType: ForgeType | null` and `forgeBaseUrl: string | null`.

---

## 3. Forge Secret Repository

New domain folder: `apps/server/src/forge-secrets/`

This folder must have a barrel file (`index.ts`) that exports its public API. Only exports from this file should be imported by code outside this folder (see coding practices on barrel files).

- `ForgeSecretRepository.ts` - interface + database implementation
  - `getForgeSecret(projectId: ProjectId) -> ProtectedString | undefined` -- decrypts on read
  - `upsertForgeSecret(projectId: ProjectId, plainToken: string) -> void` -- encrypts on write
  - `deleteForgeSecret(projectId: ProjectId) -> void`
  - Uses `EncryptionService` internally for encrypt/decrypt
  - Returns decrypted tokens wrapped in `ProtectedString` -- **never** log, serialize, or return tokens in API responses
  - All database operations must use `withNewTransaction(db, ...)` or run inside an existing transaction context (see `apps/server/src/utils/transaction-context.ts`)

---

## 4. Forge Abstraction - Two-Layer Architecture

New domain folder: `apps/server/src/forge/` (with barrel file `index.ts`). Platform-specific subdirectories: `forge/gitlab/`, `forge/github/`.

The forge system is split into two layers: **platform-specific services** that return rich types, and a **generic `GitForgeService`** that delegates and maps to common types.

### Runtime-Tagged Forge IDs

Platform-specific IDs must be distinguishable at runtime (not just branded strings). Use tagged objects:

```typescript
// Tagged union base
type ForgeId<Platform extends string, Kind extends string> = {
  platform: Platform;
  kind: Kind;
  value: string;
};

// GitLab-specific IDs
type GitLabMergeRequestId = ForgeId<"gitlab", "merge-request">;
type GitLabPipelineId = ForgeId<"gitlab", "pipeline">;
type GitLabJobId = ForgeId<"gitlab", "job">;

// GitHub-specific IDs (future)
type GitHubPullRequestId = ForgeId<"github", "pull-request">;
type GitHubWorkflowRunId = ForgeId<"github", "workflow-run">;
type GitHubJobId = ForgeId<"github", "job">;

// Union of all forge IDs for a given concept
type MergeRequestId = GitLabMergeRequestId | GitHubPullRequestId;
type PipelineId = GitLabPipelineId | GitHubWorkflowRunId;
type JobId = GitLabJobId | GitHubJobId;
```

### Platform-Specific Services (rich types)

#### GitLabService (`apps/server/src/forge/gitlab/GitLabService.ts`)

Returns rich, GitLab-specific types:

```typescript
interface GitLabService {
  getMergeRequest(id: GitLabMergeRequestId): Promise<Result<GitLabMergeRequest>>;
  createMergeRequest(options: GitLabCreateMergeRequestOptions): Promise<Result<GitLabMergeRequest>>;
  listMergeRequests(options?: GitLabListMergeRequestOptions): Promise<Result<GitLabMergeRequest[]>>;
  addMergeRequestNote(id: GitLabMergeRequestId, body: string): Promise<Result<void>>;

  listPipelines(ref?: string): Promise<Result<GitLabPipeline[]>>;
  getPipeline(id: GitLabPipelineId): Promise<Result<GitLabPipeline>>;
  listPipelineJobs(id: GitLabPipelineId): Promise<Result<GitLabJob[]>>;
  getJobLog(id: GitLabJobId): Promise<Result<string>>;

  testConnection(): Promise<Result<void>>;
}
```

- `GitLabMergeRequest` contains all GitLab-specific fields (iid, project_id, labels, approvals, diff_refs, etc.)
- Uses the [GitLab REST API v4](https://docs.gitlab.com/ee/api/rest/) with `PRIVATE-TOKEN` header
- Extracts project path from the repository URL for API calls

#### GitHubService (stub, `apps/server/src/forge/github/GitHubService.ts`)

- Same pattern but for GitHub REST API
- Stubbed with not-implemented errors for now
- Returns `GitHubPullRequest`, `GitHubWorkflowRun`, `GitHubJob`, etc.

### Generic GitForgeService (`apps/server/src/forge/GitForgeService.ts`)

Delegates to the appropriate platform service and maps results to generic types:

```typescript
interface GitForgeService {
  createMergeRequest(options: CreateMergeRequestOptions): Promise<Result<MergeRequest>>;
  getMergeRequest(id: MergeRequestId): Promise<Result<MergeRequest>>;
  listMergeRequests(options?: ListMergeRequestOptions): Promise<Result<MergeRequest[]>>;
  addMergeRequestComment(id: MergeRequestId, body: string): Promise<Result<void>>;

  listPipelines(ref?: string): Promise<Result<Pipeline[]>>;
  getPipeline(id: PipelineId): Promise<Result<Pipeline>>;
  listPipelineJobs(id: PipelineId): Promise<Result<PipelineJob[]>>;
  getJobLog(id: JobId): Promise<Result<string>>;

  testConnection(): Promise<Result<void>>;
}
```

Implementation delegates based on the runtime-tagged `platform` field on IDs, and for non-ID methods, based on the project's `forgeType`:

```typescript
class DefaultGitForgeService implements GitForgeService {
  constructor(
    private credential: ForgeCredential,
    private gitLabService: GitLabService,
    // private gitHubService: GitHubService, (future)
  ) {}

  async getMergeRequest(id: MergeRequestId): Promise<Result<MergeRequest>> {
    return match(id)
      .with({ platform: "gitlab" }, async (gitlabId) => {
        const result = await this.gitLabService.getMergeRequest(gitlabId);
        if (!result.success) return result;
        return { success: true, value: toGenericMergeRequest(result.value) };
      })
      // .with({ platform: "github" }, ...) future
      .exhaustive();
  }
}
```

### Common (generic) model types

- `MergeRequest` - id (MergeRequestId), title, description, sourceBranch, targetBranch, state, webUrl
- `Pipeline` - id (PipelineId), ref, status, webUrl, createdAt
- `PipelineJob` - id (JobId), name, stage, status

### GitForgeFactory

Constructs the appropriate service stack for a project's credential:

```typescript
function createGitForgeService(credential: ForgeCredential): GitForgeService {
  return match(credential.forgeType)
    .with("gitlab", () => {
      const gitlabService = new GitLabServiceImpl(credential);
      return new DefaultGitForgeService(credential, gitlabService);
    })
    .with("github", () => { throw new Error("GitHub not yet implemented"); })
    .exhaustive();
}
```

Code that needs platform-specific details (e.g., a UI showing GitLab approval status) can access the underlying `GitLabService` directly. Code that just needs generic info (MCP tools, workflows) uses `GitForgeService`.

---

## 5. Authenticated Git Operations

Modify [apps/server/src/git/GitService.ts](apps/server/src/git/GitService.ts) to support token-based authentication.

**Authenticated URL format** (token embedded in HTTPS URL):

- GitLab: `https://oauth2:TOKEN@gitlab.example.com/group/repo.git`
- GitHub: `https://x-access-token:TOKEN@github.com/owner/repo.git`

### Concrete `simple-git` mechanism

The existing `SimpleGitService` uses `simple-git`. The credential injection works differently for clone vs. push/fetch:

- **Clone** (`checkoutRepository`): Pass the authenticated URL directly to `parentGit.clone(authenticatedUrl, ...)`. The cloned repo's `origin` remote will store the plain (non-authenticated) URL, since we only use the authenticated URL for the clone command itself.
- **Post-clone fetch/pull/push**: The cloned repo's `origin` remote points to the plain URL. Before push/fetch operations, temporarily set the remote URL to the authenticated version using `repoGit.remote(["set-url", "origin", authenticatedUrl])`, perform the operation, then restore the original URL with `repoGit.remote(["set-url", "origin", plainUrl])`. Wrap in a try/finally to ensure the URL is always restored.
- **Helper function**: Create a `buildAuthenticatedUrl(repositoryUrl: string, forgeType: ForgeType, token: ProtectedString): string` utility that constructs the authenticated URL based on forge type.

### Interface changes

- Add an optional `credentials` parameter (containing `forgeType` and `token: ProtectedString`) to `CheckoutOptions` and to `pushRepository`
- When `credentials` is `undefined`, the existing behavior (host machine git auth) is preserved for backward compatibility

### Integration points

- In `WorkflowExecutionService.prepare()`: fetch the project's forge secret via `ForgeSecretRepository`, and the project's `forgeType` from the `Project`. Pass both into `gitService.checkoutRepository(...)`.
- In `Workflow.ts` / `realiseWorkflowConfiguration`: the workflow callbacks (`pushBranch`, `commitAndPushThenMergeToMaster`) need credentials for push. Pass credentials through via the `services` object provided to `realiseWorkflowConfiguration`.

### Security

- The token is only embedded in the URL transiently for the git command.
- After the operation, the remote URL is restored to the plain version.
- `simple-git` can log commands; ensure any custom logging does not capture the authenticated URL. The `ProtectedString` wrapper helps prevent accidental logging when the token is in memory, but the *constructed URL string* is a plain string -- do not log it.

---

## 6. MCP Tools for Forge Operations

Extend the MCP server in [apps/server/src/mcp.ts](apps/server/src/mcp.ts) with forge-related tools.

### Existing MCP patterns to follow

Reference [apps/server/src/projects/projects-mcp-handlers.ts](apps/server/src/projects/projects-mcp-handlers.ts) as the exemplar. Key patterns:

- Define each tool as an object `satisfies McpTool` (from [apps/server/src/utils/mcp-tool.ts](apps/server/src/utils/mcp-tool.ts))
- Export a list typed as `McpTools` (the type erasure helper that allows `addTools` to accept tools with different parameter types)
- Access services via `getMcpServices()` (from [apps/server/src/utils/mcp-service-context.ts](apps/server/src/utils/mcp-service-context.ts)) -- this uses `AsyncLocalStorage` so the services singleton is available without constructor injection
- Access the project ID from `session?.projectId` (set from the `X-MAL-Project-ID` header during MCP authentication)
- Database operations must be wrapped in `withNewTransaction(services.db, ...)`
- Tool `execute` functions return `string` (JSON-serialized results)

### New tools file

Create `apps/server/src/forge/forge-mcp-handlers.ts` with these tools:

- `create_merge_request` - Create an MR/PR for the current branch
- `get_merge_request` - Get MR/PR details by ID
- `list_merge_requests` - List MRs/PRs for the project
- `add_merge_request_comment` - Comment on an MR/PR
- `list_ci_pipelines` - List CI pipelines for a ref
- `get_ci_pipeline` - Get pipeline details
- `list_ci_pipeline_jobs` - List jobs in a pipeline
- `get_ci_job_log` - Get the log output of a specific CI job

Each tool should: resolve the project via `session.projectId`, look up the project's `forgeType`/`forgeBaseUrl` and forge secret, construct a `GitForgeService` via `createGitForgeService(...)`, and delegate. If the project has no forge configuration (`forgeType` is null), return a clear error message.

Register the tools in [apps/server/src/mcp.ts](apps/server/src/mcp.ts) via `mcpServer.addTools(forgeMcpTools)`. The `ForgeSecretRepository` must be added to the `Services` interface so it's accessible via `getMcpServices()`.

---

## 7. Workflow Integration

Extend [apps/server/src/workflow/Workflow.ts](apps/server/src/workflow/Workflow.ts):

- Add a new `onTaskCompleted` option: `"push-branch-and-create-mr"`
- When selected, after pushing the branch, the workflow automatically creates a merge request via the `GitForgeService`
- This is a purely additive change -- no `WorkflowConfiguration` version bump needed
- The new workflow callback: commit, push, then call `gitForgeService.createMergeRequest(...)` with the task branch as source and main branch as target

### GitForgeService lifecycle within a workflow run

The `GitForgeService` is **not a singleton** -- it's constructed per-run because it's scoped to a project's credentials. The construction happens in `BackgroundWorkflowProcessor.processRun()`:

1. `BackgroundWorkflowProcessor.processRun()` already fetches the `project` and calls `realiseWorkflowConfiguration(project.workflowConfiguration, { gitService })`.
2. After this change, it should also: fetch the project's forge secret via `ForgeSecretRepository`, and if the project has forge config (`forgeType` is not null), construct a `GitForgeService` via `createGitForgeService(...)`.
3. Pass the `GitForgeService` (or `undefined` if no forge config) into `realiseWorkflowConfiguration` via its `services` parameter: `{ gitService, gitForgeService }`.
4. The `"push-branch-and-create-mr"` branch in `realiseWorkflowConfiguration` must error if `gitForgeService` is undefined (project not configured with a forge).
5. Git credentials (for push) follow the same pattern -- the forge secret + forge type are also passed through to the git operations (see section 5).

Update [packages/api/src/projects/projects-api.ts](packages/api/src/projects/projects-api.ts):

- Add `"push-branch-and-create-mr"` to the `onTaskCompleted` enum
- Use `ts-pattern` exhaustive matching so adding this new option forces handling everywhere it's matched

---

## 8. API Changes

### Schema derivation note

Currently, `createProjectRequestSchema` is derived as `projectDtoSchema.omit({ id, queueState })`. Since `forgeToken` is write-only (never in the response DTO), the create/update schemas can no longer simply `.omit()` from the DTO schema. Instead, they should be composed explicitly -- either by extending the DTO-derived schema with `.extend({ forgeToken: ... })`, or by defining the request schemas independently.

### Response DTO changes

In [packages/api/src/projects/projects-api.ts](packages/api/src/projects/projects-api.ts) and [packages/api/src/projects/projects-model.ts](packages/api/src/projects/projects-model.ts):

- Add `forgeType` and `forgeBaseUrl` to `projectDtoSchema` (these now come from the projects table directly, so no join is needed):
  ```typescript
  forgeType: z.enum(["gitlab", "github"]).nullable(),
  forgeBaseUrl: z.string().nullable(),
  ```

- Add a `hasForgeToken: z.boolean()` field so the UI can show whether a token is configured (the handler checks whether a row exists in `project_forge_secrets`)
- The `forgeToken` value must **never** appear in any response schema

### Create request schema

Add forge fields to `createProjectRequestSchema` (**`forgeToken` is required** since we must be able to pull the repo):

```typescript
forgeType: z.enum(["gitlab", "github"]),
forgeBaseUrl: z.string().url(),
forgeToken: z.string(), // write-only, never returned in responses
```

### Update request schema

Add forge fields to `updateProjectRequestSchema` (**`forgeToken` is optional/nullish** -- omitting it means "keep existing token"):

```typescript
forgeType: z.enum(["gitlab", "github"]).optional(),
forgeBaseUrl: z.string().url().optional(),
forgeToken: z.string().nullish(), // only send when changing the token
```

### Test Connection Endpoint

Add a new endpoint under each project: `POST /projects/:projectId/test-forge-connection`

This must be registered in the Cerato API definition in the `children` of `":projectId"` in [packages/api/src/projects/projects-api.ts](packages/api/src/projects/projects-api.ts), following the same `Endpoint.post()` pattern used for `run` and `stop`. Define appropriate response schemas (success and failure).

- Resolves the project's forge config and secret
- Calls `gitForgeService.testConnection()` (which makes a lightweight authenticated API call, e.g., fetching the project/repo metadata from the forge)
- Returns `200 { success: true }` or `400 { success: false, error: string }` with a human-readable error
- If the project has no forge configuration, returns a 400 indicating forge is not configured

### Handler changes

In [apps/server/src/projects/projects-handlers.ts](apps/server/src/projects/projects-handlers.ts):

- On POST: create the project (with `forgeType` and `forgeBaseUrl` on the projects table), then create the forge secret via `ForgeSecretRepository`
- On PATCH: update project fields as before; if `forgeToken` is provided, upsert the forge secret
- On GET: `forgeType` and `forgeBaseUrl` come from the project row naturally. Query `ForgeSecretRepository` to determine `hasForgeToken` (existence check, do not fetch the actual token).
- Add handler for the `test-forge-connection` endpoint

---

## 9. Frontend Changes

### Key existing patterns

The project form is in [apps/frontend/app/components/projects/ProjectDialog.tsx](apps/frontend/app/components/projects/ProjectDialog.tsx). It:

- Uses `useState` per form field (there's a TODO to switch to react-hook-form, but follow the existing pattern for now)
- Handles both create and update via a `mode: "create" | "update"` prop
- Uses `useEffect` to reset state when the dialog opens with initial values
- Uses Shadcn components: `Input`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Button`, `Dialog`, etc.
- The `onSubmit` callback takes a `CreateProjectRequest` -- this type will now include `forgeToken`, `forgeType`, and `forgeBaseUrl`

React Query hooks live in [apps/frontend/app/lib/projects/useProjects.ts](apps/frontend/app/lib/projects/useProjects.ts). Add a `useTestForgeConnection` mutation hook there.

### Changes to make

In `ProjectDialog.tsx`:

- Add a "Git Forge" section (below "Repository URL", above "Short Code") with:
  - Forge type `Select` dropdown (GitLab / GitHub)
  - Base URL `Input` (defaulting to `https://gitlab.com` or `https://github.com` based on selected type)
  - Token `Input` with `type="password"` (required on create; on edit, use placeholder like "Token configured" if `hasForgeToken` is true, and make the field optional -- only send when the user types a new value)
  - **"Test Connection" `Button`** -- calls the `useTestForgeConnection` mutation and shows success/failure inline. Only visible when `mode === "update"` and the project has saved credentials.
- Add `"push-branch-and-create-mr"` as a `SelectItem` in the workflow configuration dropdown (label: "Push branch and create merge request")
- Update the `onSubmit` handler to include the new forge fields in the `CreateProjectRequest`
- The `ProjectDialogProps` type needs new optional initial props: `initialForgeType`, `initialForgeBaseUrl`, `initialHasForgeToken`

---

## 10. Documentation

- Add a decision document in `docs/decisions/` explaining the forge authentication architecture
- Update `docs/00-index.md` if needed

---

## Key Files to Modify

- **Encryption**: New `apps/server/src/utils/EncryptionService.ts`
- **Env config**: `apps/server/src/env.ts` (add `FORGE_ENCRYPTION_KEY`)
- **DB schema**: `apps/server/src/db/schema.ts` (new columns on projects, new `project_forge_secrets` table)
- **Forge secrets**: New folder `apps/server/src/forge-secrets/` (with `index.ts` barrel file)
- **Forge abstraction**: New folder `apps/server/src/forge/` (with `index.ts` barrel file, `gitlab/`, `github/` subdirs)
- **Forge MCP tools**: New `apps/server/src/forge/forge-mcp-handlers.ts`
- **Git auth**: `apps/server/src/git/GitService.ts`, `apps/server/src/git/GitRepository.ts`
- **MCP registration**: `apps/server/src/mcp.ts`
- **Workflow**: `apps/server/src/workflow/Workflow.ts`, `apps/server/src/workflow/BackgroundWorkflowProcessor.ts`, `apps/server/src/workflow/WorkflowExecutionService.ts`
- **API models**: `packages/api/src/projects/projects-model.ts`, `packages/api/src/projects/projects-api.ts`
- **Server handlers**: `apps/server/src/projects/projects-handlers.ts`
- **Services wiring**: `apps/server/src/services.ts` (add `ForgeSecretRepository`, `EncryptionService` to `Services` interface and composition root)
- **Frontend form**: `apps/frontend/app/components/projects/ProjectDialog.tsx`
- **Frontend hooks**: `apps/frontend/app/lib/projects/useProjects.ts`
- **Documentation**: New `docs/decisions/forge-authentication.md`, update `docs/00-index.md`
