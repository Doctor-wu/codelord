#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"

# Ensure data directories exist on host (for volume mounts)
mkdir -p "$EVAL_DIR/data/benchmarks" "$EVAL_DIR/data/workdirs" "$EVAL_DIR/data/results"

# Clone polyglot-benchmark if not present
if [ ! -d "$EVAL_DIR/data/benchmarks/polyglot-benchmark" ]; then
  echo "Cloning polyglot-benchmark..."
  git clone https://github.com/Aider-AI/polyglot-benchmark "$EVAL_DIR/data/benchmarks/polyglot-benchmark"
fi

# Load .env file if it exists (explicit -e flags below take priority)
ENV_FILE_ARG=""
if [ -f "$EVAL_DIR/.env" ]; then
  ENV_FILE_ARG="--env-file $EVAL_DIR/.env"
fi

# Build extra -e flags only for non-empty shell env vars (so .env file values aren't overridden by empty strings)
EXTRA_ENV=""
[ -n "${CODELORD_PROVIDER:-}" ]  && EXTRA_ENV="$EXTRA_ENV -e CODELORD_PROVIDER=$CODELORD_PROVIDER"
[ -n "${CODELORD_MODEL:-}" ]     && EXTRA_ENV="$EXTRA_ENV -e CODELORD_MODEL=$CODELORD_MODEL"
[ -n "${CODELORD_API_KEY:-}" ]   && EXTRA_ENV="$EXTRA_ENV -e CODELORD_API_KEY=$CODELORD_API_KEY"
[ -n "${CODELORD_BASE_URL:-}" ]  && EXTRA_ENV="$EXTRA_ENV -e CODELORD_BASE_URL=$CODELORD_BASE_URL"
[ -n "${OPENAI_API_KEY:-}" ]     && EXTRA_ENV="$EXTRA_ENV -e OPENAI_API_KEY=$OPENAI_API_KEY"
[ -n "${ANTHROPIC_API_KEY:-}" ]  && EXTRA_ENV="$EXTRA_ENV -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"

# Forward all arguments to the polyglot runner inside the container
# Named volumes shadow host node_modules (macOS-built, incompatible with Linux)
# and cache pnpm store so subsequent runs skip install
DOCKER_FLAGS=(--rm)
if [ -t 0 ] && [ -t 1 ]; then
  DOCKER_FLAGS+=(-it)
fi

docker run "${DOCKER_FLAGS[@]}" \
  $ENV_FILE_ARG \
  $EXTRA_ENV \
  -v "$REPO_ROOT":/workspace \
  -v codelord-eval-node-modules:/workspace/node_modules \
  -v codelord-eval-pnpm-store:/root/.local/share/pnpm/store \
  -e PNPM_HOME="/root/.local/share/pnpm" \
  -w /workspace/evals/polyglot \
  codelord-eval-polyglot \
  bash -c "pnpm install --store-dir /root/.local/share/pnpm/store 2>/dev/null; pnpm polyglot $*"
