FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
  git \
  curl \
  sudo \
  iputils-ping \
  nodejs \
  npm

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

WORKDIR /code
