FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
  git \
  curl \
  sudo \
  iputils-ping \
  nodejs \
  npm

# ENV OLLAMA_API_BASE=http://host.docker.internal:11434

# Install opencode
RUN curl -fsSL https://opencode.ai/install | bash

ENV PATH="/root/.local/bin:/root/.opencode/bin:${PATH}"

WORKDIR /code
