#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Building codelord-eval-browsecomp image..."
docker build -t codelord-eval-browsecomp "$EVAL_DIR"
echo "Image built: codelord-eval-browsecomp"
