#!/usr/bin/env bash
# Set up Linux host networking so that cloud-hypervisor VMs on a bridge
# can reach the host MCP server (port 3050) and the internet.
#
# This script is Linux-only and must be run once with sudo before starting
# any VM sandboxes. It is NOT run automatically — it is a developer one-off.
#
# Why it is needed:
#   - Cloud Hypervisor TAP devices attach to a Linux bridge (br0 by default).
#   - VMs need to reach the host MCP server, which listens on the bridge IP
#     (VM_HOST_BRIDGE_IP, default 192.168.100.1) at port 3050.
#   - VMs also need internet access for agent operations (npm install, API
#     calls from agent tools, etc.), provided via iptables NAT MASQUERADE.
#
# On macOS, vfkit uses Apple's Virtualization.framework built-in NAT
# networking — no manual bridge or NAT setup is needed there.
#
# NOTE: These settings are NOT persistent across reboots. Re-run this script
# after each reboot, or persist them via your distribution's mechanism
# (e.g., systemd-networkd, /etc/rc.local, or a dedicated netplan config).
#
# Usage:
#   sudo bash scripts/setup-vm-networking.sh
#
# Configuration (all optional, override via environment):
#   BRIDGE_NAME    Name of the Linux bridge (default: br0)
#   BRIDGE_IP      Host IP address assigned to the bridge (default: 192.168.100.1)
#   BRIDGE_PREFIX  Prefix length for the bridge subnet (default: 24)
#   NAT_SUBNET     Subnet for which NAT MASQUERADE is enabled (default: 192.168.100.0/24)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BRIDGE_NAME="${BRIDGE_NAME:-br0}"
BRIDGE_IP="${BRIDGE_IP:-192.168.100.1}"
BRIDGE_PREFIX="${BRIDGE_PREFIX:-24}"
# NAT_SUBNET must match BRIDGE_IP/BRIDGE_PREFIX. It is kept as a separate
# variable so callers can override all three independently if needed.
NAT_SUBNET="${NAT_SUBNET:-192.168.100.0/24}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { echo "==> $*"; }

require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "ERROR: '$1' is required but not found in PATH." >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Platform guard — this script is Linux-only
# ---------------------------------------------------------------------------

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This script is Linux-only."
  echo ""
  echo "On macOS, vfkit uses Apple's Virtualization.framework built-in NAT"
  echo "networking. No manual bridge or NAT setup is needed."
  exit 0
fi

# ---------------------------------------------------------------------------
# Root check
# ---------------------------------------------------------------------------

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: This script must be run as root." >&2
  echo "  Try: sudo bash scripts/setup-vm-networking.sh" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Pre-flight: required commands
# ---------------------------------------------------------------------------

require_cmd ip
require_cmd iptables
require_cmd sysctl

# ---------------------------------------------------------------------------
# Step 1: Create the bridge (idempotent — skip if it already exists)
# ---------------------------------------------------------------------------

if ip link show "${BRIDGE_NAME}" &>/dev/null; then
  log "Bridge '${BRIDGE_NAME}' already exists, skipping creation."
else
  log "Creating bridge '${BRIDGE_NAME}'..."
  ip link add "${BRIDGE_NAME}" type bridge
fi

# ---------------------------------------------------------------------------
# Step 2: Assign IP to the bridge (idempotent — skip if already present)
# ---------------------------------------------------------------------------

BRIDGE_CIDR="${BRIDGE_IP}/${BRIDGE_PREFIX}"

if ip addr show "${BRIDGE_NAME}" | grep -qF "${BRIDGE_CIDR}"; then
  log "IP ${BRIDGE_CIDR} already assigned to '${BRIDGE_NAME}', skipping."
else
  log "Assigning IP ${BRIDGE_CIDR} to '${BRIDGE_NAME}'..."
  ip addr add "${BRIDGE_CIDR}" dev "${BRIDGE_NAME}"
fi

# ---------------------------------------------------------------------------
# Step 3: Bring the bridge up
# ---------------------------------------------------------------------------

log "Bringing up '${BRIDGE_NAME}'..."
ip link set "${BRIDGE_NAME}" up

# ---------------------------------------------------------------------------
# Step 4: Enable IP forwarding (sysctl -w is naturally idempotent)
# ---------------------------------------------------------------------------

log "Enabling IP forwarding..."
sysctl -w net.ipv4.ip_forward=1

# ---------------------------------------------------------------------------
# Step 5: Add NAT MASQUERADE rule (idempotent — check before adding)
# ---------------------------------------------------------------------------
# iptables -C exits 0 if the rule already exists, non-zero otherwise.

if iptables -t nat -C POSTROUTING -s "${NAT_SUBNET}" -j MASQUERADE 2>/dev/null; then
  log "NAT MASQUERADE rule for ${NAT_SUBNET} already exists, skipping."
else
  log "Adding NAT MASQUERADE rule for ${NAT_SUBNET}..."
  iptables -t nat -A POSTROUTING -s "${NAT_SUBNET}" -j MASQUERADE
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

log "VM networking is ready."
echo ""
echo "Summary:"
echo "  Bridge name : ${BRIDGE_NAME}"
echo "  Bridge IP   : ${BRIDGE_CIDR}"
echo "  NAT subnet  : ${NAT_SUBNET}"
echo ""
echo "Cloud Hypervisor TAP devices should be attached to '${BRIDGE_NAME}'."
echo "Set MCP_SERVER_URL for VM sandboxes to: http://${BRIDGE_IP}:3050/mcp"
echo ""
echo "REMINDER: These settings are not persistent. Re-run this script after"
echo "each reboot, or configure persistence via your distribution's network"
echo "management tooling."
