---
name: BetterAuth User Accounts and Workspace Memberships
overview: Add BetterAuth-based magic-link sign-in, membership-ready workspace authorization, and a post-sign-in workspace bootstrap flow while keeping the current single-workspace UX for v1.
todos:
  - id: auth-decision-doc
    content: Add a decision record in `docs/decisions/` describing the BetterAuth integration, the split between identity/session data and app-owned workspace membership data, the console-logging email stub, and why invite behavior is deferred even though invite-ready tables are added. Update `docs/00-index.md` to link the new decision doc.
    status: completed
  - id: auth-schema
    content: Extend `apps/server/src/db/schema.ts` with the BetterAuth tables needed for users, sessions, accounts, and verification tokens, plus app-owned `workspace_memberships` and invite-ready `workspace_invitations` tables. Keep memberships role-free for now, but shape the schema so invitations can be implemented later without redesigning ownership. Do not generate migration files; leave that to a human.
    status: completed
  - id: auth-env-email
    content: Extend `apps/server/src/env.ts` and add an `apps/server/src/auth/` domain for BetterAuth configuration, including auth secrets/base URL and a stub email sender that logs the magic-link URL to console for the operator instead of sending real mail.
    status: completed
  - id: auth-server-mount
    content: Mount BetterAuth under `/api/auth/*` in `apps/server/src/index.ts` alongside the existing Cerato API. Keep BetterAuth as the source of truth for user identity and sessions, with the existing Hono server remaining the single backend entrypoint.
    status: completed
  - id: auth-context
    content: Add request-level auth helpers in `apps/server/src/auth/` to resolve the current session/user from BetterAuth and expose helpers such as `requireAuthenticatedUser`, `requireWorkspaceMembership`, and project/task membership lookups that hide whether a resource exists outside the caller's memberships.
    status: completed
  - id: auth-api
    content: Add a small typed app auth surface in `packages/api` and matching server handlers for `GET /api/session` and `POST /api/session/bootstrap-workspace`. `GET /api/session` should return the signed-in user, membership-backed workspaces, and whether bootstrap is required. `POST /api/session/bootstrap-workspace` should create the user's first workspace plus membership in one transaction and reject repeat bootstrap attempts.
    status: completed
  - id: workspace-service-auth
    content: Update workspace services and handlers so all workspace listing, fetching, and creation flows are user-aware instead of global. `GET /api/workspaces` must return only workspaces the current user belongs to, and workspace bootstrap should become the only v1 path for creating a user's initial workspace.
    status: completed
  - id: project-task-auth
    content: Update project and task handlers/services so every read and mutation is authorized through workspace membership. Add membership-aware lookup helpers for workspace, project, and task IDs, and return `401` when anonymous and `404` when the resource is outside the caller's memberships.
    status: completed
  - id: admin-disable
    content: Disable the current global admin dashboard and admin API for the auth-enabled release. Remove or hide the frontend route and block the backend endpoints until a real instance-admin model exists.
    status: completed
  - id: frontend-auth-client
    content: Add frontend auth utilities for BetterAuth in `apps/frontend/app/lib/`, including the magic-link request flow and signed-in session bootstrapping. Keep BetterAuth client usage focused on auth actions, and continue using Cerato for typed app API calls.
    status: completed
  - id: frontend-auth-gate
    content: Replace the anonymous root boot flow in `apps/frontend/app/root.tsx` with a dedicated auth gate. Unauthenticated visitors should see a magic-link sign-in screen. Authenticated users should call the new session endpoint and then either enter the app or see the one-time workspace bootstrap form if they have no memberships.
    status: completed
  - id: frontend-bootstrap
    content: Adapt the current workspace setup UI into a post-sign-in workspace bootstrap step that asks the new user to name their first workspace. On success, create the workspace via the bootstrap endpoint and proceed into the normal app shell.
    status: completed
  - id: single-workspace-v1
    content: Preserve the current single-workspace UX by continuing to select the first available workspace in the frontend context providers, but make that an explicit temporary behavior backed by membership-filtered workspace data rather than globally visible workspaces.
    status: completed
  - id: auth-errors-hooks
    content: Update frontend hooks and data-loading flows to treat `401` as an auth/session state transition instead of a generic request failure. Make sure signed-out or expired-session states fall back to the auth gate cleanly.
    status: completed
  - id: tests
    content: Add server and frontend tests covering magic-link auth bootstrapping, session resolution, first-workspace bootstrap, membership-based authorization for workspace/project/task APIs, the frontend admin route staying hidden, and root gating behavior for anonymous, bootstrap-required, and fully bootstrapped users.
    status: completed
isProject: false
---

# BetterAuth User Accounts and Workspace Memberships

## Context

Today the app is anonymous end-to-end. The frontend boots straight into a workspace-creation screen when no workspaces exist, and the backend trusts workspace and project IDs from the request without checking which user is making the call.

The repo already treats `Workspace` as the top-level domain boundary. The docs also indicate that workspaces are expected to gain user membership in the future. That makes workspace membership the correct authorization boundary for v1, even though the user-facing experience will stay single-workspace for now.

BetterAuth should provide identity and cookie-backed session management. The application itself should continue to own domain concepts such as workspaces, memberships, and future invitations.

## Design Decisions

### BetterAuth owns identity and sessions

Use BetterAuth for users, sessions, accounts, and magic-link verification. Mount it under `/api/auth/*` on the existing Hono server so the frontend can rely on same-origin cookie handling.

### App tables own memberships and future invites

Do not model workspaces through BetterAuth plugins in v1. Keep workspace membership in the app's own schema because the rest of the backend is already organized around `Workspace`, `Project`, and `Task` domains. Add invite-ready tables now, but do not build invitation behavior yet.

### Magic-link only for v1

The only sign-in mechanism for this release is magic link. There is no password flow, reset flow, social login, or real email provider integration. The email sender should log the magic-link URL to console so an operator can copy it manually.

### Dedicated auth gate

Unauthenticated visitors should see a dedicated sign-in screen before any workspace or project data loads. After sign-in, the app checks whether the user has memberships. If not, it shows a one-time workspace bootstrap step.

### First workspace is created after sign-in

Do not auto-create a workspace on account creation. A newly signed-in user without memberships should name their first workspace. Submitting that form creates both the workspace and the membership in one transaction.

### Authorization behavior

All workspace, project, and task operations require authentication and membership in the owning workspace. Anonymous requests return `401`. Requests for resources outside the caller's memberships should return `404` rather than revealing existence.

### Keep v1 single-workspace UX

Although the data model allows multiple memberships, the frontend should continue to behave as a single-workspace app by selecting the first workspace returned from the membership-filtered list. Workspace switching remains out of scope.

### Disable admin for now

The current admin dashboard is global to the whole instance and has no compatible permissions model yet. Block it in this release instead of exposing it to all signed-in users.

## Implementation Guide

### 1. Add auth and membership persistence

Update `apps/server/src/db/schema.ts` with:

- BetterAuth tables for user/session/account/verification data
- `workspace_memberships`
- invite-ready `workspace_invitations`

Memberships only need to capture relationship existence for now. Do not add a role system yet.

### 2. Add a dedicated server auth domain

Create an `apps/server/src/auth/` folder that owns:

- BetterAuth configuration
- request/session resolution helpers
- auth-aware utility functions
- any lightweight repository or service helpers needed for user bootstrap and membership checks

Keep this separate from workspace/project services so auth concerns stay explicit.

### 3. Mount BetterAuth in the server entrypoint

Update `apps/server/src/index.ts` so `/api/auth/*` is handled by BetterAuth while the Cerato routes continue to serve the typed app API under `/api/*`.

### 4. Add a typed session/bootstrap API

Add new app-owned auth/session endpoints in `packages/api` and matching handlers in the server:

- `GET /api/session`
- `POST /api/session/bootstrap-workspace`

These endpoints should be the typed bridge between BetterAuth's session state and the app's workspace bootstrap and authorization state.

### 5. Make workspace access user-aware

Refactor workspace services and handlers so they operate on the current user instead of all workspaces globally. Key behaviors:

- list only the caller's workspaces
- fetch only if the caller is a member
- create the first workspace through the bootstrap endpoint

Keep transaction handling with `withNewTransaction(...)`.

### 6. Enforce membership checks for projects and tasks

Add membership-aware lookup helpers and update handlers/services so:

- project lists are scoped to a workspace the caller belongs to
- project/task fetches and mutations only work for membership-backed resources
- cross-workspace ID guessing returns `404`

The implementing agent should prefer central auth helpers over scattering ad hoc checks through every handler.

### 7. Replace the anonymous frontend boot flow

Update `apps/frontend/app/root.tsx` so the app boot sequence becomes:

1. If no authenticated session, show the magic-link auth screen.
2. If authenticated but no memberships, show the workspace bootstrap form.
3. If authenticated and bootstrapped, enter the current app shell.

### 8. Reuse the existing workspace setup UI as bootstrap

Adapt the current workspace setup experience so it becomes a post-sign-in bootstrap step instead of an anonymous first-run screen. The form should still just collect the workspace name, but it now creates a workspace for the current user rather than for the whole anonymous instance.

### 9. Keep frontend workspace context intentionally temporary

Leave the current "pick the first workspace" pattern in place in the workspace context provider, but document it as a temporary v1 simplification. The provider should consume only membership-filtered workspace data from the authenticated session/app APIs.

### 10. Update hooks and error handling

Any frontend hook that currently throws a generic error on failed API calls should treat `401` as a signed-out or expired-session state. This should reset the app back to the auth gate rather than leaving React Query in a broken state.

### 11. Disable admin

Remove or hide the frontend admin route and ensure backend admin endpoints are no longer usable in the auth-enabled release.

### 12. Document the architecture

Add a decision record in `docs/decisions/` covering:

- why BetterAuth is the identity/session layer
- why workspace membership stays app-owned
- why invite-ready tables exist without invite behavior
- why email sending is stubbed to console logging in v1

Update `docs/00-index.md` if needed.

## Edge Cases and Error Handling

- Requesting multiple magic links for the same email should be safe.
- A signed-in user with zero memberships must never enter the main app shell.
- The workspace bootstrap endpoint must reject users who already have a membership, so it cannot silently create extra workspaces in v1.
- Invalid or expired magic links should fail through BetterAuth's normal flow, with a simple retry path in the UI.
- Cross-workspace resource access should look like "not found", not "forbidden".
- Existing hooks that assume anonymous success paths should be updated so auth expiration recovers cleanly.

## Out of Scope

- Real email provider integration
- Password login or reset flows
- Social/OAuth login
- Invitation create/accept APIs or UI
- Workspace switching UI
- Membership roles
- Instance-admin modeling or a replacement admin dashboard
