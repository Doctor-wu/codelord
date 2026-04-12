#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# run.sh — Convenience wrapper for running Terminal-Bench with codelord
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env if present
if [ -f "$EVAL_DIR/.env" ]; then
  set -a
  source "$EVAL_DIR/.env"
  set +a
fi

# Defaults
MODEL="${MODEL:-anthropic/claude-sonnet-4-6}"
N_CONCURRENT="${N_CONCURRENT:-4}"
LIMIT="${LIMIT:-}"
CODELORD_API_KEY="${CODELORD_API_KEY:-}"
CODELORD_REASONING_LEVEL="${CODELORD_REASONING_LEVEL:-low}"
CODELORD_BASE_URL="${CODELORD_BASE_URL:-}"

# Preflight checks
if ! command -v harbor &> /dev/null; then
  echo "ERROR: harbor not found. Install with: pipx install harbor"
  exit 1
fi

if [ ! -f "$EVAL_DIR/codelord-bundle.tar.gz" ]; then
  echo "ERROR: codelord-bundle.tar.gz not found. Run: ./scripts/build-bundle.sh"
  exit 1
fi

if [ -z "$CODELORD_API_KEY" ]; then
  echo "ERROR: CODELORD_API_KEY not set. Set it in .env or export it."
  exit 1
fi

# Ensure codelord_agent.py is importable
export PYTHONPATH="$EVAL_DIR:${PYTHONPATH:-}"

# Build harbor run command
CMD=(
  harbor run
  -d "terminal-bench@2.0"
  --agent-import-path "codelord_agent:CodelordAgent"
  -m "$MODEL"
  -n "$N_CONCURRENT"
  --ae "CODELORD_API_KEY=$CODELORD_API_KEY"
  --ae "CODELORD_REASONING_LEVEL=$CODELORD_REASONING_LEVEL"
)

if [ -n "$CODELORD_BASE_URL" ]; then
  CMD+=(--ae "CODELORD_BASE_URL=$CODELORD_BASE_URL")
fi

if [ -n "$LIMIT" ]; then
  CMD+=(--n-tasks "$LIMIT")
fi

# Pass through any extra args
CMD+=("$@")

echo "==> Running: ${CMD[*]}"
exec "${CMD[@]}"
