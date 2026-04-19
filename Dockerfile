FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
  git \
  curl \
  sudo \
  iputils-ping \
  ca-certificates \
  gnupg \
  build-essential

# Install Node.js 24.x (active LTS)
RUN mkdir -p /etc/apt/keyrings && \
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
  apt-get update && \
  apt-get install -y nodejs

# Install pnpm
RUN npm install -g pnpm

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

# Copy the prebuilt driver binary into the image
COPY apps/driver/dist-sea/driver /usr/local/bin/driver

RUN chmod +x /usr/local/bin/driver && mkdir -p /code

WORKDIR /code
