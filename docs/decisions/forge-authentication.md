# Forge Authentication Architecture

## Context

The application needs to perform git operations (clone, push, fetch) and forge API operations (create merge requests, list pipelines, get job logs) against GitLab and eventually GitHub. These operations require per-project credentials (personal access tokens, with OAuth designed for later).

## Decision

- **Token type**: Personal Access Tokens (PATs) for now; architecture allows OAuth (refresh token, expiry, scopes) later.
- **Credential scope**: Per-project. Each project stores its own forge type, base URL, and encrypted token.
- **Self-hosted support**: Forge base URL is configurable (e.g. `https://gitlab.mycompany.com`).
- **Encryption**: AES-256-GCM with a server-side master key (`FORGE_ENCRYPTION_KEY`). Tokens are encrypted at rest in a separate `project_forge_secrets` table.
- **Storage**: Hybrid. Forge *configuration* (type, base URL) lives on the `projects` table so it can be returned in API responses. Forge *secrets* (encrypted token) live in `project_forge_secrets` (1:1 with projects) and are never returned in responses.
- **API**: Forge config and `hasForgeToken` are exposed; `forgeToken` is write-only on create/update. A `POST /projects/:projectId/test-forge-connection` endpoint verifies credentials.
- **Git auth**: When credentials are present, clone and push/fetch use token-in-URL HTTPS auth (e.g. `https://oauth2:TOKEN@host/repo.git` for GitLab). The remote URL is restored to the plain URL after operations so tokens are not persisted in the repo config.
- **Forge API layer**: Two-layer design. Platform-specific services (e.g. `GitLabService`) return rich types; a generic `GitForgeService` delegates and maps to common types (`MergeRequest`, `Pipeline`, `PipelineJob`) for MCP tools and workflows.
- **Workflow**: An optional `push-branch-and-create-mr` workflow commits, pushes the branch, and creates a merge request via the forge API. It requires the project to have forge credentials configured.

## Consequences

- Existing projects without forge config continue to use host machine git auth.
- New projects require forge type, base URL, and token on create.
- MCP tools and workflow automation use the same `GitForgeService` and credential resolution path.
- Tokens are only decrypted when needed and are wrapped in `ProtectedString` in memory to reduce accidental logging or serialization.
