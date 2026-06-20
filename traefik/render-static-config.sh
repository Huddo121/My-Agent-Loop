#!/bin/sh
set -eu

# Traefik treats file and environment static configuration as mutually
# exclusive sources. Render the one operator-provided value into the mounted
# template instead of relying on unsupported interpolation inside traefik.yml.
escaped_email=$(printf '%s' "$ACME_EMAIL" | sed 's/[\\&|]/\\&/g')
sed "s|\${ACME_EMAIL}|$escaped_email|g" \
  /etc/traefik/traefik.yml \
  > /tmp/traefik.yml

exec /entrypoint.sh --configFile=/tmp/traefik.yml
