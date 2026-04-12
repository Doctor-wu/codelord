#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# build-bundle.sh — Build codelord into a standalone tarball for Harbor
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../.." && pwd)"
BUNDLE_DIR="$EVAL_DIR/bundle"
TARBALL="$EVAL_DIR/codelord-bundle.tar.gz"

echo "==> Repo root: $REPO_ROOT"
echo "==> Bundle dir: $BUNDLE_DIR"

# Clean previous bundle
rm -rf "$BUNDLE_DIR" "$TARBALL"

# Build the monorepo
echo "==> Building monorepo..."
(cd "$REPO_ROOT" && pnpm build)

# Deploy coding-agent with production deps into bundle/
echo "==> Deploying @codelord/coding-agent..."
(cd "$REPO_ROOT" && pnpm --filter @codelord/coding-agent deploy --legacy "$BUNDLE_DIR" --prod)

# Verify the bin entry exists
if [ ! -f "$BUNDLE_DIR/dist/bin.js" ]; then
  echo "ERROR: dist/bin.js not found in bundle"
  exit 1
fi

# Create a bin/ wrapper script
mkdir -p "$BUNDLE_DIR/bin"
cat > "$BUNDLE_DIR/bin/codelord" << 'BINEOF'
#!/usr/bin/env node
import('../dist/bin.js');
BINEOF
chmod +x "$BUNDLE_DIR/bin/codelord"

# Also create a shell wrapper for PATH convenience
cat > "$BUNDLE_DIR/bin/codelord-run" << SHEOF
#!/usr/bin/env bash
exec node "\$(dirname "\$0")/codelord" "\$@"
SHEOF
chmod +x "$BUNDLE_DIR/bin/codelord-run"

# Quick smoke test
echo "==> Smoke test: node bundle/dist/bin.js --version"
VERSION=$(node "$BUNDLE_DIR/dist/bin.js" --version 2>&1 || true)
echo "    Version: $VERSION"

# Create tarball
echo "==> Creating tarball..."
(cd "$EVAL_DIR" && tar czf codelord-bundle.tar.gz bundle/)

SIZE=$(du -sh "$TARBALL" | cut -f1)
echo "==> Done: $TARBALL ($SIZE)"
