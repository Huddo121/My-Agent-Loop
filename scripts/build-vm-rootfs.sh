#!/usr/bin/env bash
# Build a raw ext4 VM rootfs image from the project's Dockerfile and download a
# pre-built kernel for use with Cloud Hypervisor (Linux) or vfkit (macOS).
#
# Usage:
#   bash scripts/build-vm-rootfs.sh
#
# Configuration (all optional, override via environment):
#   IMAGE_NAME      Docker image to build/export (default: my-agent-loop)
#   OUTPUT_DIR      Directory for produced artifacts (default: .vm)
#   ROOTFS_SIZE     Size of the raw disk image (default: 10G)
#   KERNEL_URL      Full URL to the kernel binary to download
#                   (default: auto-selected by arch — see below)
#   KERNEL_VERSION  cloud-hypervisor/linux release tag used to build the default URL
#                   (default: 6.12-ch1)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

IMAGE_NAME="${IMAGE_NAME:-my-agent-loop}"
OUTPUT_DIR="${OUTPUT_DIR:-.vm}"
ROOTFS_SIZE="${ROOTFS_SIZE:-10G}"
# cloud-hypervisor/linux release tag. Releases publish per-arch kernel assets named
# Image-arm64 / bzImage-x86_64 (verified against the releases page). Override with a newer
# tag as they are published.
KERNEL_VERSION="${KERNEL_VERSION:-ch-release-v6.16.9-20260508}"

# Pick a kernel asset that matches the current machine's architecture.
# - Cloud Hypervisor on Linux x86_64 needs the x86_64 bzImage.
# - vfkit on Apple Silicon macOS needs the uncompressed arm64 Image (NOT the .gz).
# The kernel must match the architecture of the host the VM will run on, not the
# build machine, so we default to the current machine's arch and let the caller
# override KERNEL_URL when cross-building.
_ARCH="$(uname -m)"
case "${_ARCH}" in
  arm64 | aarch64)
    # Apple Silicon / ARM64 Linux — vfkit on macOS expects an uncompressed Image
    _DEFAULT_KERNEL_ASSET="Image-arm64"
    _DEFAULT_KERNEL_ARCH="arm64"
    ;;
  x86_64 | amd64)
    # x86_64 Linux — cloud-hypervisor expects a compressed bzImage
    _DEFAULT_KERNEL_ASSET="bzImage-x86_64"
    _DEFAULT_KERNEL_ARCH="x86_64"
    ;;
  *)
    echo "ERROR: Unsupported architecture '${_ARCH}'. Set KERNEL_URL explicitly." >&2
    exit 1
    ;;
esac

KERNEL_URL="${KERNEL_URL:-https://github.com/cloud-hypervisor/linux/releases/download/${KERNEL_VERSION}/${_DEFAULT_KERNEL_ASSET}}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VM_INIT_SH="${REPO_ROOT}/apps/server/src/sandbox/vm/vm-init.sh"
OUTPUT_DIR_ABS="${REPO_ROOT}/${OUTPUT_DIR}"

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
# Pre-flight checks
# ---------------------------------------------------------------------------

require_cmd docker
require_cmd curl
require_cmd pnpm

if [[ ! -f "${VM_INIT_SH}" ]]; then
  echo "ERROR: vm-init.sh not found at ${VM_INIT_SH}" >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR_ABS}"

# ---------------------------------------------------------------------------
# Step 0: Download the kernel
# ---------------------------------------------------------------------------
# Done first, before the expensive driver/image/ext4 work: a wrong KERNEL_URL is
# a cheap network failure, and there is no point spending ~10 minutes building a
# rootfs only to fall over on the kernel download at the very end.

KERNEL_FILENAME="$(basename "${KERNEL_URL}")"
KERNEL_OUT="${OUTPUT_DIR_ABS}/${KERNEL_FILENAME}"

if [[ -f "${KERNEL_OUT}" ]]; then
  log "Kernel already present at ${KERNEL_OUT}, skipping download."
else
  log "Downloading kernel (${_DEFAULT_KERNEL_ARCH}) from ${KERNEL_URL}..."
  # -f: fail on HTTP errors, -L: follow redirects, --retry: handle transient failures
  curl -fL --retry 3 --retry-delay 2 -o "${KERNEL_OUT}" "${KERNEL_URL}"
  log "Kernel downloaded to ${KERNEL_OUT}"
fi

# ---------------------------------------------------------------------------
# Step 1: Build the Docker image
# ---------------------------------------------------------------------------
# The Dockerfile COPYs the prebuilt Linux driver binary
# (apps/driver/dist-sea/linux/driver) into the image, so it must exist before
# `docker build` runs. `pnpm docker:build` normally produces it via
# `driver:build:linux`; we do the same here, then build the image ourselves so
# the IMAGE_NAME override is honoured.

log "Building the Linux driver binary..."
(cd "${REPO_ROOT}" && pnpm driver:build:linux)

log "Building Docker image '${IMAGE_NAME}'..."
docker build -t "${IMAGE_NAME}" "${REPO_ROOT}"

# ---------------------------------------------------------------------------
# Step 2: Export the image filesystem into a tarball
# ---------------------------------------------------------------------------
# docker export produces a flat tar of the container's merged filesystem
# (i.e., all layers unioned), which is exactly what we need for a rootfs.

TEMP_CONTAINER="${IMAGE_NAME}-rootfs-export-$$"
ROOTFS_TAR="${OUTPUT_DIR_ABS}/rootfs.tar"

# Ensure the temporary container is removed even if the script fails midway.
cleanup() {
  log "Cleaning up..."
  docker rm -f "${TEMP_CONTAINER}" 2>/dev/null || true
  rm -f "${ROOTFS_TAR}"
}
trap cleanup EXIT

log "Creating temporary container for export..."
docker create --name "${TEMP_CONTAINER}" "${IMAGE_NAME}" /bin/true

log "Exporting container filesystem to tarball..."
docker export "${TEMP_CONTAINER}" >"${ROOTFS_TAR}"

# ---------------------------------------------------------------------------
# Step 3 + 4: Create a raw ext4 disk image and populate it
# ---------------------------------------------------------------------------
# mkfs.ext4, loopback mount, and umount require Linux kernel features that are
# not available on macOS. Rather than adding a platform branch that silently
# skips on macOS, we perform these steps inside a privileged Linux Docker
# container. This makes the script portable: developers on both macOS and Linux
# run the same command and get the same artifact.
#
# The privileged flag is required so the container can use loop devices and
# mount filesystems. We bind-mount just the OUTPUT_DIR so the container can
# read the tarball and write back the final raw image.

ROOTFS_RAW="${OUTPUT_DIR_ABS}/rootfs.raw"

log "Creating raw ext4 disk image (${ROOTFS_SIZE}) via Linux container..."

# We pass the vm-init.sh content in through a bind-mount of the repo root so
# the inner container can copy it into the rootfs without needing network access.

docker run --rm --privileged \
  -v "${OUTPUT_DIR_ABS}:/output" \
  -v "${VM_INIT_SH}:/vm-init.sh:ro" \
  debian:bookworm-slim \
  bash -euo pipefail -c "
    export DEBIAN_FRONTEND=noninteractive

    # Install e2fsprogs for mkfs.ext4. We pin to a slim base to keep the pull fast.
    apt-get update -q && apt-get install -y -q --no-install-recommends e2fsprogs

    # Allocate the raw image file.
    truncate -s ${ROOTFS_SIZE} /output/rootfs.raw

    # Format as ext4. -F forces even though it is a regular file.
    mkfs.ext4 -F /output/rootfs.raw

    # Mount via a loop device and populate with the exported filesystem.
    mkdir -p /mnt/rootfs
    mount -o loop /output/rootfs.raw /mnt/rootfs

    echo '  Extracting tarball into rootfs...'
    # --numeric-owner preserves uid/gid without relying on the host's passwd/group.
    tar -xf /output/rootfs.tar -C /mnt/rootfs --numeric-owner

    # -----------------------------------------------------------------------
    # Step 4: Install vm-init.sh at /sbin/vm-init
    # -----------------------------------------------------------------------
    # This script is the kernel's init target (init=/sbin/vm-init). It mounts
    # /proc, /sys, /dev, and the virtio-fs share before handing off to the
    # per-run vm-mount-setup.sh. It must be present and executable in the rootfs.
    cp /vm-init.sh /mnt/rootfs/sbin/vm-init
    chmod +x /mnt/rootfs/sbin/vm-init

    umount /mnt/rootfs
    echo '  Disk image ready.'
  "

log "rootfs.raw created at ${ROOTFS_RAW}"

# The trap will clean up the container and tarball; disarm it for the normal
# exit path so we can print final artifact paths first, then clean up.
trap - EXIT
cleanup

# ---------------------------------------------------------------------------
# Step 6: Build the initramfs
# ---------------------------------------------------------------------------
# vfkit's Linux bootloader requires an initrd, and Virtualization.framework does
# not mount the root disk for us — so we ship a tiny busybox initramfs whose only
# job is to mount the rootfs disk (/dev/vda) and switch_root into the baked-in
# init (/sbin/vm-init). The kernel boots this first, then hands off to the rootfs.
#
# This initramfs is generic: it depends only on the disk appearing as /dev/vda
# and the rootfs providing /sbin/vm-init, so it does not need rebuilding when the
# rootfs contents change. We still build it here so all VM artifacts come from one
# command.

INITRAMFS_OUT="${OUTPUT_DIR_ABS}/initramfs.cpio.gz"
INIT_SCRIPT="${OUTPUT_DIR_ABS}/.initramfs-init"

# Write the initramfs /init on the host with a quoted heredoc so none of the
# runtime expansions ($(...), $i) are evaluated now — they must run inside the VM.
cat >"${INIT_SCRIPT}" <<'INITRAMFS_INIT'
#!/bin/busybox sh
/bin/busybox --install -s /bin
mount -t devtmpfs dev /dev 2>/dev/null
mount -t proc proc /proc
mount -t sysfs sys /sys
# The virtio-blk root disk can take a moment to appear; wait briefly for it.
for _ in $(seq 1 25); do [ -b /dev/vda ] && break; sleep 0.2; done
mkdir -p /mnt/root
if mount -t ext4 /dev/vda /mnt/root; then
  exec switch_root /mnt/root /sbin/vm-init
fi
echo "initramfs: failed to mount /dev/vda as ext4 root" >&2
exec sh
INITRAMFS_INIT

log "Building initramfs..."
docker run --rm \
  -v "${OUTPUT_DIR_ABS}:/out" \
  debian:bookworm-slim \
  bash -euo pipefail -c '
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -q >/dev/null
    apt-get install -y -q --no-install-recommends busybox-static cpio gzip >/dev/null

    rm -rf /ird && mkdir -p /ird/bin /ird/dev /ird/proc /ird/sys /ird/mnt
    cp "$(command -v busybox)" /ird/bin/busybox
    cp /out/.initramfs-init /ird/init
    chmod +x /ird/init

    # newc is the cpio format the kernel expects for an initramfs.
    (cd /ird && find . | cpio -o -H newc 2>/dev/null | gzip) > /out/initramfs.cpio.gz
  '

rm -f "${INIT_SCRIPT}"
log "initramfs created at ${INITRAMFS_OUT}"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

log "Build complete. Artifacts in ${OUTPUT_DIR_ABS}:"
echo "  Rootfs    : ${ROOTFS_RAW}"
echo "  Kernel    : ${KERNEL_OUT}"
echo "  Initramfs : ${INITRAMFS_OUT}"
echo ""
echo "Configure the server by setting:"
echo "  VM_ROOTFS_PATH=${ROOTFS_RAW}"
echo "  VM_KERNEL_PATH=${KERNEL_OUT}"
echo "  VM_INITRD_PATH=${INITRAMFS_OUT}"
