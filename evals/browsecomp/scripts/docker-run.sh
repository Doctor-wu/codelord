#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"

mkdir -p "$EVAL_DIR/data/results"

ENV_FILE_ARG=""
if [ -f "$EVAL_DIR/.env" ]; then
  ENV_FILE_ARG="--env-file $EVAL_DIR/.env"
fi

EXTRA_ENV=""
[ -n "${CODELORD_PROVIDER:-}" ] && EXTRA_ENV="$EXTRA_ENV -e CODELORD_PROVIDER=$CODELORD_PROVIDER"
[ -n "${CODELORD_MODEL:-}" ] && EXTRA_ENV="$EXTRA_ENV -e CODELORD_MODEL=$CODELORD_MODEL"
[ -n "${CODELORD_API_KEY:-}" ] && EXTRA_ENV="$EXTRA_ENV -e CODELORD_API_KEY=$CODELORD_API_KEY"
[ -n "${CODELORD_BASE_URL:-}" ] && EXTRA_ENV="$EXTRA_ENV -e CODELORD_BASE_URL=$CODELORD_BASE_URL"
[ -n "${OPENAI_API_KEY:-}" ] && EXTRA_ENV="$EXTRA_ENV -e OPENAI_API_KEY=$OPENAI_API_KEY"
[ -n "${ANTHROPIC_API_KEY:-}" ] && EXTRA_ENV="$EXTRA_ENV -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
[ -n "${TAVILY_API_KEY:-}" ] && EXTRA_ENV="$EXTRA_ENV -e TAVILY_API_KEY=$TAVILY_API_KEY"
[ -n "${GRADER_PROVIDER:-}" ] && EXTRA_ENV="$EXTRA_ENV -e GRADER_PROVIDER=$GRADER_PROVIDER"
[ -n "${GRADER_MODEL:-}" ] && EXTRA_ENV="$EXTRA_ENV -e GRADER_MODEL=$GRADER_MODEL"
[ -n "${GRADER_API_KEY:-}" ] && EXTRA_ENV="$EXTRA_ENV -e GRADER_API_KEY=$GRADER_API_KEY"
[ -n "${GRADER_BASE_URL:-}" ] && EXTRA_ENV="$EXTRA_ENV -e GRADER_BASE_URL=$GRADER_BASE_URL"

docker run --rm -it \
  $ENV_FILE_ARG \
  $EXTRA_ENV \
  -v "$REPO_ROOT":/workspace \
  -v codelord-eval-node-modules:/workspace/node_modules \
  -v codelord-eval-pnpm-store:/root/.local/share/pnpm/store \
  -e PNPM_HOME="/root/.local/share/pnpm" \
  -w /workspace/evals/browsecomp \
  codelord-eval-browsecomp \
  bash -c "pnpm install --store-dir /root/.local/share/pnpm/store 2>/dev/null; pnpm solve $*"
