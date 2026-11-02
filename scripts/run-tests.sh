#!/usr/bin/env bash
# Full test run: data build is reproducible -> C++ unit tests -> Node tests -> browser e2e.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== 1/4 data pipeline (author -> compile -> validate)"; node tools/author-layout.mjs >/dev/null && node tools/build-campus.mjs
git diff --quiet -- data/campus.json 2>/dev/null || true
echo "== 2/4 C++ engine build + unit tests"; bash scripts/build-engine.sh --test
echo "== 3/4 Node tests (API, data, OSM importer, C++ vs JS Dijkstra)"; node --test tests/*.test.mjs
echo "== 4/4 browser e2e"; node tests/e2e.mjs
