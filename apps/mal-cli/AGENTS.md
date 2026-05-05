# My Agent Loop CLI

## Purpose

`apps/mal-cli` is the local helper CLI for user OAuth flows. It authenticates a user to MAL, then brokers provider OAuth credentials from the user's machine and uploads them to the MAL server.

## Commands

- `mal login`: authenticate the CLI to MAL using PKCE on `http://localhost:53682/auth/callback`.
- `mal logout`: delete the local MAL CLI auth file.
- `mal status`: show local MAL login state and configured provider credentials returned by the server.
- `mal providers login codex`: run the OpenAI Codex OAuth flow on `http://localhost:1455/auth/callback` and upload the tokens to MAL.
- `mal providers logout codex`: delete the stored OpenAI Codex credential from MAL.

## Local storage

CLI auth state is stored at `${XDG_CONFIG_HOME:-~/.config}/mal/auth.json`. The config directory must be mode `0700`, and the auth file must be mode `0600`. The CLI can still read and delete the legacy `${XDG_CONFIG_HOME:-~/.config}/mal-cli/auth.json` path for upgrades.

Do not store provider OAuth tokens in this local file. Provider tokens are uploaded to the server and stored encrypted in `user_harness_oauth_credentials`.

## Development workflow

- Use `MAL_BASE_URL` to point the CLI at a non-default app origin. The default is `http://localhost:5173`.
- For local TypeScript execution, use `pnpm mal -- ...`.
- Build the local SEA binary with `pnpm mal:build:sea`.
- Build the Linux SEA binary with `pnpm mal:build:linux`.
- The package bin points at `./dist-sea/mal`.

## Manual smoke test

This is a manual end-to-end test. Do not assume it has been run just because the docs or implementation were updated.

1. Start Postgres, Redis, the server, and the frontend dev server.
2. Ensure the server has `OAUTH_CREDENTIALS_ENCRYPTION_KEY` configured.
3. Build the CLI with `pnpm mal:build:sea`.
4. Run `apps/mal-cli/dist-sea/mal login`.
5. Run `apps/mal-cli/dist-sea/mal providers login codex`.
6. Confirm a row exists in `user_harness_oauth_credentials` for provider `openai-codex`.
7. Trigger a Codex run on a test task.
8. Inspect the running sandbox and confirm `/root/.codex/auth.json` exists.
9. Confirm the sandbox did not receive `OPENAI_API_KEY`.
10. Confirm Codex completed inference under the subscription-auth path.

For SSH or remote development, the CLI must run where the browser can reach the callback listener. If the browser is not on the same machine, use port forwarding such as `LocalForward 1455 localhost:1455` for the Codex flow and `LocalForward 53682 localhost:53682` for the MAL login flow.

Only one `mal providers login codex` flow can run at a time because OpenAI's Codex OAuth redirect URI is fixed to port `1455`.
