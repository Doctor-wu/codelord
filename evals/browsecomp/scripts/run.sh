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
[ -n "${OFFSET:-}" ] && ARGS+=(--offset "$OFFSET")
[ -n "${OUTPUT_DIR:-}" ] && ARGS+=(--output "$OUTPUT_DIR/results.json")
[ -n "${SKIP_GRADE:-}" ] && ARGS+=(--skip-grade)

export CODELORD_PROVIDER="${CODELORD_PROVIDER:-}"
export CODELORD_MODEL="${CODELORD_MODEL:-}"
export CODELORD_API_KEY="${CODELORD_API_KEY:-}"
export CODELORD_BASE_URL="${CODELORD_BASE_URL:-}"
export CODELORD_REASONING_LEVEL="${CODELORD_REASONING_LEVEL:-low}"
export TAVILY_API_KEY="${TAVILY_API_KEY:-}"
export GRADER_PROVIDER="${GRADER_PROVIDER:-}"
export GRADER_MODEL="${GRADER_MODEL:-}"
export GRADER_API_KEY="${GRADER_API_KEY:-}"
export GRADER_BASE_URL="${GRADER_BASE_URL:-}"

cd "$EVAL_DIR"
exec pnpm solve "${ARGS[@]}" "$@"
