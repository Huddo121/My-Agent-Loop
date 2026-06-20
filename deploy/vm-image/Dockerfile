# Container-wrapped VM artifact.
#
# The VM sandbox rootfs is not a runnable container image, but it can still ride
# the same registry, auth and SHA-tagging as every other MAL image if we wrap it
# in a `FROM scratch` image whose only contents are the artifacts. This avoids a
# second distribution mechanism (e.g. oras or release assets) and reuses the
# docker login/pull the host already has.
#
# Published as ghcr.io/huddo121/my-agent-loop-sandbox-vm:<sha>. The host extracts
# the files with `docker create` + `docker cp` into its VM cache directory — the
# same extraction pattern the deployment bundle uses. The VM sandbox service then
# boots from VM_ROOTFS_PATH / VM_KERNEL_PATH pointing at the extracted files.
#
# The build context is the build-vm-rootfs.sh output directory (.vm). Only the
# amd64 Cloud Hypervisor artifacts are included; the initramfs is vfkit/macOS-only
# and the host (deimos) does not need it.
FROM scratch
COPY rootfs.raw /rootfs.raw
COPY bzImage-x86_64 /bzImage-x86_64
