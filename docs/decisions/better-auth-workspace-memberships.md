# BetterAuth and Workspace Memberships

## Context

The application previously ran as a fully anonymous single-user tool. The frontend booted directly into workspace creation, and backend handlers trusted workspace and project identifiers from the request without checking who was calling them.

This repository already treats `Workspace` as the top-level domain boundary. Projects and tasks are nested underneath a workspace, and the concepts document explicitly calls out future workspace membership support.

We need authenticated user accounts now, but the first release does not need invitation workflows, workspace switching, or instance-level admin management.

## Decision

- **Identity and sessions**: BetterAuth is the source of truth for users, sessions, linked accounts, and verification records.
- **Auth method**: Magic-link sign-in only. Email/password, reset flows, and social login are out of scope for this release.
- **Email delivery**: Use a stub sender that logs the magic-link URL to the server console. This keeps the flow testable without committing the repo to a mail provider yet.
- **Workspace authorization**: Workspace membership remains an app-owned concept. We store memberships in our own tables instead of using BetterAuth organization features.
- **Bootstrap flow**: A signed-in user with no memberships is required to create their first workspace before entering the app shell. Creating that workspace also creates the initial membership.
- **Access control**: Workspace, project, and task APIs require an authenticated session plus workspace membership. Anonymous requests return `401`. Requests for resources outside the caller's memberships return `404`.
- **Frontend behavior**: The data model allows multiple memberships, but the v1 UI remains single-workspace by selecting the first available workspace.
- **Admin**: The existing global admin dashboard is disabled until the app has an explicit instance-admin model.

## Consequences

- New server environment requirements include `BETTER_AUTH_SECRET` and `APP_BASE_URL`.
- Local development should set `BETTER_AUTH_SECRET` and `APP_BASE_URL` in `apps/server/.env.local`.
- Database schema work now includes BetterAuth tables (`user`, `session`, `account`, `verification`) plus the app-owned `workspace_memberships` table.
- BetterAuth endpoints are mounted under `/api/auth/*`, while app-specific auth state is exposed through typed Cerato endpoints under `/api/session`.
- The anonymous workspace creation path is removed from the main app boot. Authentication and workspace bootstrap are now separate steps.
- Invitation behavior is intentionally deferred until there is a concrete workflow to implement.
