#!/bin/sh
mount -t proc proc /proc
mount -t sysfs sys /sys
mount -t devtmpfs dev /dev

# Mount virtio-fs shared directory from host
mkdir -p /mnt/host
mount -t virtiofs hostshare /mnt/host

# Hand off to the per-run setup script
exec /mnt/host/vm-mount-setup.sh
