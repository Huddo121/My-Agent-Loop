FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
  git \
  curl \
  sudo \
  iputils-ping \
  ca-certificates \
  gnupg \
  build-essential

# Install Node.js 20.x (minimum for SEA support)
RUN mkdir -p /etc/apt/keyrings && \
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
  apt-get update && \
  apt-get install -y nodejs

# Install pnpm
RUN npm install -g pnpm

# Install postject for SEA injection
RUN npm install -g postject

# ENV OLLAMA_API_BASE=http://host.docker.internal:11434

# Install OpenCode harness CLI
RUN curl -fsSL https://opencode.ai/install | bash

# Install Claude Code harness CLI (claude)
RUN curl -fsSL https://claude.ai/install.sh | bash

# Install Cursor CLI harness (agent)
RUN curl -fsSL https://cursor.com/install | bash

# Install Codex CLI harness
RUN npm install -g @openai/codex

ENV PATH="/root/.local/bin:/root/.opencode/bin:${PATH}"

# Copy entire monorepo to get workspace dependencies
COPY . /code
WORKDIR /code

# Install all dependencies (including workspace packages)
RUN pnpm install

# Build the driver binary
RUN pnpm run driver:build

# Move the driver binary to a common location
RUN mkdir -p /usr/local/bin && \
    mv apps/driver/dist-sea/driver /usr/local/bin/driver && \
    chmod +x /usr/local/bin/driver

WORKDIR /code
