#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$EVAL_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$EVAL_DIR/.env"
  set +a
fi

ARGS=()
[ -n "${LIMIT:-}" ] && ARGS+=(--limit "$LIMIT")
[ -n "${INSTANCE_IDS:-}" ] && ARGS+=(--instance-ids "$INSTANCE_IDS")
[ -n "${REPOS:-}" ] && ARGS+=(--repos "$REPOS")
[ -n "${OUTPUT_DIR:-}" ] && ARGS+=(--output "$OUTPUT_DIR/results.json")

export CODELORD_PROVIDER="${CODELORD_PROVIDER:-}"
export CODELORD_MODEL="${CODELORD_MODEL:-}"
export CODELORD_API_KEY="${CODELORD_API_KEY:-}"
export CODELORD_BASE_URL="${CODELORD_BASE_URL:-}"
export CODELORD_REASONING_LEVEL="${CODELORD_REASONING_LEVEL:-low}"

cd "$EVAL_DIR"
exec pnpm solve "${ARGS[@]}" "$@"
