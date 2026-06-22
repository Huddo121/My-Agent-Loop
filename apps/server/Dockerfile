# Packaging-only runtime image for @mono/server.
#
# This Dockerfile compiles nothing. Prepare the artifact on the host first, then
# build with the prepared bundle as the build context:
#
#   pnpm --filter @mono/server build
#   pnpm --filter=@mono/server deploy --prod --legacy apps/server/deploy
#   docker build -f apps/server/Dockerfile -t my-agent-loop-server apps/server/deploy
#
# docker-compose.prod.yml wires this up as the `server` service. The separate
# root Dockerfile (the agent sandbox image) is unrelated and stays as-is.

FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# The build context is the `pnpm deploy` bundle: the built dist/ (including the
# lifecycle.sh asset), package.json, and a self-contained node_modules holding
# the built @mono/* workspace packages and production dependencies.
COPY . .

# 3000 = HTTP API, 3050 = MCP. Documentation only; docker-compose.prod.yml keeps
# both on internal networks rather than publishing them.
EXPOSE 3000 3050

# Default command runs the server. The same image also bundles the one-shot
# forward migrator (dist/migrate.js + dist/drizzle); the compose `migrate`
# service overrides the command to `node dist/migrate.js` to apply migrations
# before the server starts. See docs/decisions/production-migrations.md.
CMD ["node", "dist/index.js"]
