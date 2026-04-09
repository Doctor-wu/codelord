FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates python3 \
    && rm -rf /var/lib/apt/lists/*

# pnpm for workspace resolution
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace
