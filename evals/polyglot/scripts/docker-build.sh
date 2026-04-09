#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Building codelord-eval-polyglot image..."
docker build -t codelord-eval-polyglot "$EVAL_DIR"
echo "Image built: codelord-eval-polyglot"
