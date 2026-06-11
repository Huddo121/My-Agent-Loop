#!/usr/bin/env bash
# Boot the built VM artifacts with vfkit and verify the whole chain end to end:
#   kernel boot -> initramfs -> switch_root -> /sbin/vm-init -> virtio-fs mount
#   -> per-run vm-mount-setup.sh, including a host<->guest virtio-fs write.
#
# This is the practical "does a VM actually boot and share files" check that unit
# tests cannot cover. It runs the same vfkit configuration that VmSandboxService /
# VfkitAdapter use in production.
#
# macOS / vfkit only. On Linux the equivalent path is cloud-hypervisor, which this
# script does not yet drive (see scripts/setup-vm-networking.sh and the adapters).
#
# Usage:
#   pnpm vm:smoke-test
#
# Configuration (optional, override via environment):
#   OUTPUT_DIR      Where the VM artifacts live (default: .vm)
#   VM_KERNEL_PATH  Kernel image (default: <OUTPUT_DIR>/<arch asset>)
#   VM_ROOTFS_PATH  Raw rootfs disk (default: <OUTPUT_DIR>/rootfs.raw)
#   VM_INITRD_PATH  Initramfs (default: <OUTPUT_DIR>/initramfs.cpio.gz)
#   SMOKE_TIMEOUT   Seconds to wait for the VM before forcing stop (default: 30)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-.vm}"
OUTPUT_DIR_ABS="${REPO_ROOT}/${OUTPUT_DIR}"

# Default kernel asset name by arch — matches build-vm-rootfs.sh.
case "$(uname -m)" in
  arm64 | aarch64) _KERNEL_ASSET="Image-arm64" ;;
  x86_64 | amd64) _KERNEL_ASSET="bzImage-x86_64" ;;
  *) _KERNEL_ASSET="" ;;
esac

VM_KERNEL_PATH="${VM_KERNEL_PATH:-${OUTPUT_DIR_ABS}/${_KERNEL_ASSET}}"
VM_ROOTFS_PATH="${VM_ROOTFS_PATH:-${OUTPUT_DIR_ABS}/rootfs.raw}"
VM_INITRD_PATH="${VM_INITRD_PATH:-${OUTPUT_DIR_ABS}/initramfs.cpio.gz}"

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: vm:smoke-test currently supports macOS/vfkit only." >&2
  exit 1
fi

if ! command -v vfkit >/dev/null 2>&1; then
  echo "ERROR: vfkit not found. Install it with: brew install vfkit" >&2
  exit 1
fi

for artifact in "${VM_KERNEL_PATH}" "${VM_ROOTFS_PATH}" "${VM_INITRD_PATH}"; do
  if [[ ! -f "${artifact}" ]]; then
    echo "ERROR: missing artifact: ${artifact}" >&2
    echo "       Build the VM artifacts first with: pnpm vm:build-rootfs" >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Set up an isolated shared directory with a smoke vm-mount-setup.sh
# ---------------------------------------------------------------------------
# vm-init.sh execs /mnt/host/vm-mount-setup.sh after mounting virtio-fs, so the
# share must contain that script. Ours writes a marker back through virtio-fs
# (proving host<->guest sharing both ways) and then powers the VM off.

WORK_DIR="$(mktemp -d)"
SHARE_DIR="${WORK_DIR}/share"
CONSOLE_LOG="${WORK_DIR}/console.log"
VFKIT_LOG="${WORK_DIR}/vfkit.log"
MARKER_NAME="vm-smoke-marker.txt"
MARKER_TEXT="vm-smoke-ok-$$"
NET_MARKER_NAME="vm-smoke-net.txt"
mkdir -p "${SHARE_DIR}"

cleanup() { rm -rf "${WORK_DIR}"; }
trap cleanup EXIT

cat >"${SHARE_DIR}/vm-mount-setup.sh" <<EOF
#!/bin/sh
echo "VM-SMOKE: vm-init handed off; contents of /mnt/host:"
ls -la /mnt/host
if echo "${MARKER_TEXT}" > /mnt/host/${MARKER_NAME}; then
  echo "VM-SMOKE: virtio-fs write ok"
else
  echo "VM-SMOKE: virtio-fs write FAILED"
fi
# Verify the initramfs brought networking up. The rootfs has no ip/ifconfig, so we read
# /proc/net/route directly: a default route (destination 00000000) means udhcpc obtained a
# lease and installed a gateway. Recorded through virtio-fs so the host can assert on it.
if grep -qiE '^[a-z0-9]+\s+00000000\s' /proc/net/route 2>/dev/null; then
  echo "VM-SMOKE: default route present (networking up)"
  echo "net-ok" > /mnt/host/${NET_MARKER_NAME}
else
  echo "VM-SMOKE: NO default route (networking down)"
fi
echo "VM-SMOKE: powering off"
# Clean shutdown via magic sysrq; the host watchdog is the fallback.
echo o > /proc/sysrq-trigger 2>/dev/null || true
sleep 5
EOF
chmod +x "${SHARE_DIR}/vm-mount-setup.sh"

# ---------------------------------------------------------------------------
# Boot
# ---------------------------------------------------------------------------

echo "==> Booting VM with vfkit (kernel=${VM_KERNEL_PATH##*/}, timeout=${SMOKE_TIMEOUT:-30}s)..."
vfkit \
  --cpus 2 --memory 2048 \
  --bootloader "linux,kernel=${VM_KERNEL_PATH},initrd=${VM_INITRD_PATH},cmdline=\"console=hvc0\"" \
  --device virtio-blk,path="${VM_ROOTFS_PATH}" \
  --device virtio-fs,sharedDir="${SHARE_DIR}",mountTag=hostshare \
  --device virtio-net,nat \
  --device virtio-serial,logFilePath="${CONSOLE_LOG}" \
  >"${VFKIT_LOG}" 2>&1 &
VFKIT_PID=$!

# Watchdog: force-stop the VM if it does not power off on its own in time.
( sleep "${SMOKE_TIMEOUT:-30}"; kill "${VFKIT_PID}" 2>/dev/null ) &
WATCHDOG_PID=$!

wait "${VFKIT_PID}" 2>/dev/null || true
kill "${WATCHDOG_PID}" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------

if [[ "$(cat "${SHARE_DIR}/${MARKER_NAME}" 2>/dev/null)" != "${MARKER_TEXT}" ]]; then
  echo "==> FAIL: smoke marker was not written back through virtio-fs." >&2
  echo "--- guest console ---" >&2
  cat "${CONSOLE_LOG}" 2>/dev/null >&2 || echo "(no guest console output)" >&2
  echo "--- vfkit log ---" >&2
  cat "${VFKIT_LOG}" 2>/dev/null >&2 || true
  exit 1
fi

if [[ "$(cat "${SHARE_DIR}/${NET_MARKER_NAME}" 2>/dev/null)" != "net-ok" ]]; then
  echo "==> FAIL: guest did not bring up networking (no default route)." >&2
  echo "          The in-VM driver needs this to reach the host; check the initramfs DHCP." >&2
  echo "--- guest console ---" >&2
  cat "${CONSOLE_LOG}" 2>/dev/null >&2 || echo "(no guest console output)" >&2
  exit 1
fi

echo "==> PASS: VM booted, ran /sbin/vm-init, mounted virtio-fs, the host<->guest"
echo "          write round-trip succeeded, and the guest brought up NAT networking."
exit 0
