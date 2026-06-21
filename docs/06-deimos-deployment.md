# Deimos deployment

MAL runs on the homelab host `deimos` as a Docker Compose project, behind the
host's **shared Traefik** and triggered by the host's **shared deploy webhook**.
This mirrors the agent-first-forge deployment shape; the difference is that MAL
keeps its artifacts in **GHCR** (it is a GitHub project) rather than the GitLab
registry, and it adds on-boot database migrations and an optional VM sandbox
artifact.

The committed files under [`deploy/`](../deploy/) are source templates. Deimos
owns the installed copies and every secret value. Editing a template does not
change the host until an operator reinstalls it.

## Request flow

```text
GitHub Actions (publish-production.yml)
  -> builds + pushes GHCR images for the commit SHA
  -> POST https://webhook.incredibleplatform.com/hooks/my-agent-loop  (X-Deploy-Token, {"version":"<sha>"})
  -> shared webhook listener (127.0.0.1:9001) validates token + SHA
  -> sudo /usr/local/sbin/deploy-my-agent-loop <sha>
  -> docker compose pull -> up --wait (server self-migrates on boot; rollback on failure)

Public traffic:
  loop.incredibleplatform.com -> shared Traefik (host network, :443)
    /api/internal* -> 403 (loopback-only middleware)
    /api*          -> 127.0.0.1:23000  (MAL server)
    /*             -> 127.0.0.1:28080  (MAL web/SPA)
```

The MAL server and web containers bind only to `127.0.0.1`. The shared Traefik
runs with `network_mode: host`, so it reaches them over loopback. Postgres,
Redis, the MCP listener (3050), and sandbox containers publish no host ports.

## 1. DNS

Create a Cloudflare **DNS-only** `A` record for `loop.incredibleplatform.com`
pointing at the home public IP (or the host's LAN address via local DNS if the
app stays private). Certificate issuance uses Cloudflare DNS-01, so the app does
not need public ingress for TLS. `webhook.incredibleplatform.com` is already set
up by the shared webhook service.

## 2. Registry login (as root)

The deploy script runs as root, so root's Docker config must hold the GHCR
credential. This is **in addition** to the host's existing GitLab login — Docker
keeps per-registry credentials, so both coexist.

```sh
# A GitHub PAT / token with read:packages for the MAL images.
sudo docker login ghcr.io -u <github-username>
```

## 3. Install the templates

Stage `deploy/` onto the host, then install (paths shown explicitly):

```sh
# Directories
sudo install -d -m 0755 /opt/my-agent-loop /opt/my-agent-loop/runs /opt/my-agent-loop/vm
sudo install -d -m 0700 /etc/my-agent-loop

# Compose project + non-secret project env (0644)
sudo install -m 0644 deploy/application/compose.yaml         /opt/my-agent-loop/compose.yaml
sudo install -m 0644 deploy/application/deployment.env.example /opt/my-agent-loop/.env

# Secrets (0600), host-only, never copied back into the repo
sudo install -m 0600 deploy/application/server.env.example   /etc/my-agent-loop/server.env
sudo install -m 0600 deploy/application/db.env.example       /etc/my-agent-loop/db.env

# Root-owned host commands
sudo install -m 0755 deploy/application/deploy-my-agent-loop /usr/local/sbin/deploy-my-agent-loop
sudo install -m 0755 deploy/application/refresh-vm-image     /usr/local/sbin/refresh-vm-image

# Shared Traefik route (drop into the shared Traefik's dynamic directory)
sudo install -m 0644 deploy/application/traefik/dynamic/my-agent-loop.yaml.example \
  /opt/<shared-traefik>/traefik/dynamic/my-agent-loop.yaml

# Shared webhook hook (append into the shared hooks file) + sudoers
sudo install -m 0440 -o root -g root deploy/webhook/my-agent-loop-deploy.sudoers \
  /etc/sudoers.d/my-agent-loop-deploy
sudo visudo --check --file /etc/sudoers.d/my-agent-loop-deploy
```

Append the contents of `deploy/webhook/my-agent-loop.hook.yaml.example` to the
shared webhook's `hooks.yaml` (the listener exposes it at `/hooks/my-agent-loop`),
then restart that service.

Edit the installed files before the first deploy:

- `/opt/my-agent-loop/.env`: confirm `MAL_RUNS_DIR`.
- `/etc/my-agent-loop/server.env`: set `DATABASE_URL` (password must match
  `db.env`), the three secrets, `APP_BASE_URL`, and the VM values if used.
- `/etc/my-agent-loop/db.env`: set the Postgres password.
- The installed Traefik route: confirm `loop.incredibleplatform.com`.
- The installed hook: replace `REPLACE_WITH_LONG_RANDOM_TOKEN` (`openssl rand -hex 32`).

## 4. First deploy

```sh
sudo /usr/local/sbin/deploy-my-agent-loop <40-char-commit-sha>
```

The script validates the SHA, takes a `flock`, pulls the GHCR images, then
`up --wait` for the whole project. The server applies committed forward-only
migrations itself on boot before its healthcheck passes, so `--wait` blocks until
the schema is migrated and everything is healthy; a failed migration keeps the
server unhealthy and triggers a rollback to the previously deployed SHA
(application only — schema is never reversed). The active SHA is recorded in
`/opt/my-agent-loop/deployed-version`.

## 5. GitHub Actions configuration

In the repo's **production** environment, set:

| Name | Kind | Value |
| --- | --- | --- |
| `DEPLOY_ENABLED` | variable | `true` |
| `MAL_DEPLOY_WEBHOOK_URL` | secret | `https://webhook.incredibleplatform.com/hooks/my-agent-loop` |
| `MAL_DEPLOY_WEBHOOK_TOKEN` | secret | the token installed in the hook |

Image publishing runs on every successful `main` CI; the notify job only fires
when `DEPLOY_ENABLED` is `true`. A failed webhook call is not retried
automatically — re-run the job after fixing the cause.

## 6. VM sandbox artifact

VM sandboxes need the rootfs + kernel extracted from the published
`my-agent-loop-sandbox-vm:<sha>` image. This rotates independently of the app:

```sh
sudo /usr/local/sbin/refresh-vm-image <40-char-commit-sha>
```

It extracts into `/opt/my-agent-loop/vm/<sha>/` and atomically repoints
`/opt/my-agent-loop/vm/current`, which `VM_KERNEL_PATH` / `VM_ROOTFS_PATH` in
`server.env` reference. New VM sandboxes use `current`; sandboxes already running
keep the file they booted from. Prune old `vm/<sha>/` directories once no sandbox
references them.

## 7. Firewall

Sandbox network isolation is enforced by host iptables rules, not Compose. After
any deploy that recreates the server, reapply them (see
[the production firewall guide](05-production-firewall.md), which installs a
systemd unit for reboot persistence):

```sh
sudo systemctl restart my-agent-loop-firewall.service
```

The firewall script resolves the installed Compose project at
`/opt/my-agent-loop/compose.yaml` (override with `MAL_COMPOSE_FILE`).

## 8. Update, roll back, verify

- **Update**: merge to `main`; CI publishes and (if enabled) notifies. Or deploy a
  specific SHA manually with the deploy script.
- **Roll back**: call the deploy script (or webhook) with a previously published
  SHA. No schema reversal occurs, so only roll back across backward-compatible
  migrations.
- **Inspect**:

```sh
cd /opt/my-agent-loop && sudo docker compose ps
cd /opt/my-agent-loop && sudo docker compose logs server
curl -ki https://loop.incredibleplatform.com/api/health
curl -ki https://loop.incredibleplatform.com/api/internal/anything   # expect 403
```

## Updating installed artifacts

Deployment infrastructure is intentionally not self-deploying. Review the diff,
reinstall only the changed files, validate with `docker compose config`, and
restart the affected service so an application pipeline cannot silently widen its
own host privileges.
