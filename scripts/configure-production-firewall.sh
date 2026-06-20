#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root so it can manage iptables." >&2
  exit 1
fi

for command_name in docker iptables ip6tables; do
  if ! command -v "$command_name" >/dev/null; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
compose_file="$repository_root/docker-compose.prod.yml"
sandbox_network_name=mal-sandbox-net
app_network_name=my-agent-loop_app-net

# Docker may restore restart-policy containers shortly after the daemon reports
# ready. Wait for the server so its current network address can be allowlisted.
server_container_id=""
for _ in {1..60}; do
  server_container_id=$(docker compose -f "$compose_file" ps -q server)
  if [[ -n "$server_container_id" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$server_container_id" ]]; then
  echo "The production server container did not appear within 60 seconds." >&2
  exit 1
fi

sandbox_network_id=$(docker network inspect --format '{{.Id}}' "$sandbox_network_name")
sandbox_bridge="br-${sandbox_network_id:0:12}"
sandbox_subnet=$(docker network inspect \
  --format '{{(index .IPAM.Config 0).Subnet}}' "$sandbox_network_name")
app_subnet=$(docker network inspect \
  --format '{{(index .IPAM.Config 0).Subnet}}' "$app_network_name")
server_ip=$(docker inspect \
  --format "{{with index .NetworkSettings.Networks \"$sandbox_network_name\"}}{{.IPAddress}}{{end}}" \
  "$server_container_id")

if [[ -z "$sandbox_subnet" || -z "$app_subnet" || -z "$server_ip" ]]; then
  echo "Could not discover the production network addresses." >&2
  exit 1
fi

forward_chain=MAL-SANDBOX-FORWARD
input_chain=MAL-SANDBOX-INPUT
ipv6_forward_chain=MAL-SANDBOX6-FORWARD
ipv6_input_chain=MAL-SANDBOX6-INPUT

iptables -w -N "$forward_chain" 2>/dev/null || true
iptables -w -F "$forward_chain"
iptables -w -C DOCKER-USER -i "$sandbox_bridge" -s "$sandbox_subnet" -j "$forward_chain" 2>/dev/null || \
  iptables -w -I DOCKER-USER 1 -i "$sandbox_bridge" -s "$sandbox_subnet" -j "$forward_chain"

iptables -w -A "$forward_chain" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -w -A "$forward_chain" -d "$server_ip" -p tcp -m multiport --dports 3000,3050 -j ACCEPT
iptables -w -A "$forward_chain" -d "$sandbox_subnet" -j DROP
iptables -w -A "$forward_chain" -d "$app_subnet" -j DROP
iptables -w -A "$forward_chain" -d 10.0.0.0/8 -j DROP
iptables -w -A "$forward_chain" -d 172.16.0.0/12 -j DROP
iptables -w -A "$forward_chain" -d 192.168.0.0/16 -j DROP
iptables -w -A "$forward_chain" -d 169.254.0.0/16 -j DROP
iptables -w -A "$forward_chain" -j ACCEPT

# Traffic addressed to deimos itself traverses INPUT rather than DOCKER-USER.
# Drop it separately so sandboxes cannot reach Docker-published or host services.
iptables -w -N "$input_chain" 2>/dev/null || true
iptables -w -F "$input_chain"
iptables -w -C INPUT -i "$sandbox_bridge" -s "$sandbox_subnet" -j "$input_chain" 2>/dev/null || \
  iptables -w -I INPUT 1 -i "$sandbox_bridge" -s "$sandbox_subnet" -j "$input_chain"
iptables -w -A "$input_chain" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -w -A "$input_chain" -j DROP

# The compose bridge is IPv4-only. Reject unexpected IPv6 on that interface so
# host-gateway IPv6 resolution cannot bypass the IPv4 policy.
ip6tables -w -N "$ipv6_forward_chain" 2>/dev/null || true
ip6tables -w -F "$ipv6_forward_chain"
# Docker may omit its IPv6 DOCKER-USER chain when IPv6 container networking is
# disabled, so hook the kernel FORWARD chain directly for this defensive rule.
ip6tables -w -C FORWARD -i "$sandbox_bridge" -j "$ipv6_forward_chain" 2>/dev/null || \
  ip6tables -w -I FORWARD 1 -i "$sandbox_bridge" -j "$ipv6_forward_chain"
ip6tables -w -A "$ipv6_forward_chain" -j DROP

ip6tables -w -N "$ipv6_input_chain" 2>/dev/null || true
ip6tables -w -F "$ipv6_input_chain"
ip6tables -w -C INPUT -i "$sandbox_bridge" -j "$ipv6_input_chain" 2>/dev/null || \
  ip6tables -w -I INPUT 1 -i "$sandbox_bridge" -j "$ipv6_input_chain"
ip6tables -w -A "$ipv6_input_chain" -j DROP

echo "Applied MAL sandbox firewall: $sandbox_subnet may reach $server_ip on TCP 3000/3050 and the public IPv4 internet."
