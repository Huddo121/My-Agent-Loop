# Container-wrapped VM artifact.
#
# The VM sandbox rootfs is not a runnable container image, but it can still ride
# the same registry, auth and SHA-tagging as every other MAL image if we wrap it
# in a minimal image whose only contents are the artifacts. This avoids a second
# distribution mechanism (e.g. oras or release assets) and reuses the docker
# login/pull the host already has.
#
# Published as ghcr.io/huddo121/my-agent-loop-sandbox-vm:<sha>. The host extracts
# the files with `docker create` + `docker cp` into its VM cache directory; the
# deploy script does this in-band, so the VM base image is versioned with the app.
#
# NOTE: this is NOT `FROM scratch`. `docker create` refuses an image with no
# command ("no command specified"), and a scratch image has none. busybox is a
# ~4 MB base that provides a default command, so `docker create` succeeds (the
# container is only ever created + cp'd from, never started).
#
# The build context is the build-vm-rootfs.sh output directory (.vm). Cloud
# Hypervisor on Linux boots kernel + initramfs and mounts the rootfs as /dev/vda,
# so all three artifacts are required (VmSandboxService enforces this).
FROM busybox:1.37.0
COPY rootfs.raw /artifacts/rootfs.raw
COPY bzImage-x86_64 /artifacts/bzImage-x86_64
COPY initramfs.cpio.gz /artifacts/initramfs.cpio.gz
