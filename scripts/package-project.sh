#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building C++ route engine..."
npm run build:engine

echo "==> Building campus dataset..."
npm run build:data

echo "==> Running engine unit tests..."
npm run test:engine

ZIP_NAME="cu-campus-nav-updated.zip"
echo "==> Creating clean archive $ZIP_NAME..."
rm -f "$ZIP_NAME"

# Clean up unwanted artifacts
find . -name ".DS_Store" -delete 2>/dev/null || true

zip -q -r "$ZIP_NAME" \
  package.json \
  README.md \
  docs \
  engine \
  build/route_engine \
  build/engine_tests \
  data \
  public \
  server \
  tools \
  scripts \
  tests \
  -x "node_modules/*" "*.git*" ".DS_Store"

echo "==> Packaging complete: $ZIP_NAME ($(du -h "$ZIP_NAME" | cut -f1))"
