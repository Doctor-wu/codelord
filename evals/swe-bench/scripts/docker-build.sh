#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Building codelord-eval-swebench image..."
docker build -t codelord-eval-swebench "$EVAL_DIR"
echo "Image built: codelord-eval-swebench"
