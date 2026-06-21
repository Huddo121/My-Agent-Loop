# Production firewall

Docker network separation keeps sandboxes off `app-net`, but a normal bridge
still gives them routes to peer containers, the host, the LAN, and the internet.
On `deimos`, install host firewall rules after the production containers are up.
These rules cannot live in Compose: Docker evaluates forwarded container traffic
through the host's `DOCKER-USER` chain.

The repository script discovers the live bridge subnets and current server IP.
It allows sandbox connections only to the server's driver API and MCP ports,
drops sandbox-to-sandbox, datastore, host, link-local, and private/LAN traffic,
then permits other IPv4 egress for git hosts, package registries, and model APIs.
An `INPUT` hook is also required because packets addressed to `deimos` do not
traverse `DOCKER-USER`. Unexpected IPv6 from the IPv4-only bridge is dropped.

From the checked-out repository on `deimos`:

```bash
sudo ./scripts/configure-production-firewall.sh
sudo iptables -S DOCKER-USER
sudo iptables -S MAL-SANDBOX-FORWARD
sudo iptables -S MAL-SANDBOX-INPUT
```

The server container IP can change when Compose recreates it, so reapply the
script after each deployment. Install this systemd oneshot to reapply it after a
host reboot; replace `/opt/my-agent-loop` if the checkout lives elsewhere:

```bash
sudo tee /etc/systemd/system/my-agent-loop-firewall.service >/dev/null <<'EOF'
[Unit]
Description=My Agent Loop sandbox firewall
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/my-agent-loop
ExecStart=/opt/my-agent-loop/scripts/configure-production-firewall.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now my-agent-loop-firewall.service
```

Restart the unit after every deployment that recreates the server (the deploy
script runs `docker compose ... up`):

```bash
sudo systemctl restart my-agent-loop-firewall.service
```

Do not use `iptables -F` to update these rules. The script owns and flushes only
its four `MAL-SANDBOX*` chains, preserving Docker and host firewall policy.
