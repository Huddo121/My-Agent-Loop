#!/bin/sh
set -eu

# Traefik treats file and environment static configuration as mutually
# exclusive sources. Render the one operator-provided value into the mounted
# template instead of relying on unsupported interpolation inside traefik.yml.
escaped_email=$(printf '%s' "$ACME_EMAIL" | sed 's/[\\&|]/\\&/g')
sed "s|\${ACME_EMAIL}|$escaped_email|g" \
  /etc/traefik/traefik.yml \
  > /tmp/traefik.yml

# ACME discovers certificate domains from router Host rules. Reuse the public
# application origin so ingress and auth configuration cannot drift apart.
case "$APP_BASE_URL" in
  https://*) app_authority=${APP_BASE_URL#https://} ;;
  *)
    echo "APP_BASE_URL must be an https:// origin" >&2
    exit 1
    ;;
esac
app_authority=${app_authority%/}
case "$app_authority" in
  ""|*/*|*:*|*[!A-Za-z0-9.-]*)
    echo "APP_BASE_URL must contain a hostname without a path or port" >&2
    exit 1
    ;;
esac

escaped_domain=$(printf '%s' "$app_authority" | sed 's/[\\&|]/\\&/g')
sed "s|\${APP_DOMAIN}|$escaped_domain|g" \
  /etc/traefik/dynamic.yml \
  > /tmp/dynamic.yml

exec /entrypoint.sh --configFile=/tmp/traefik.yml
