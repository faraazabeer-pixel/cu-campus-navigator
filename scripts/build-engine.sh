#!/usr/bin/env bash
# Builds build/route_engine (and build/engine_tests). Uses CMake when available, plain g++/clang++ otherwise.
# Usage: scripts/build-engine.sh [--test]
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build
if command -v cmake >/dev/null 2>&1; then
  cmake -S . -B build/cmake -DCMAKE_BUILD_TYPE=Release >/dev/null
  cmake --build build/cmake -j >/dev/null
  cp build/cmake/route_engine build/route_engine
  cp build/cmake/engine_tests build/engine_tests
else
  CXX="${CXX:-$(command -v g++ || command -v clang++)}"
  SRC="engine/src/graph.cpp engine/src/router.cpp engine/src/directions.cpp engine/src/protocol.cpp"
  $CXX -std=c++17 -O2 -Wall -Wextra -Iengine/include $SRC engine/src/main.cpp -o build/route_engine
  $CXX -std=c++17 -O2 -Wall -Wextra -Iengine/include $SRC engine/tests/test_main.cpp -o build/engine_tests
fi
echo "built build/route_engine"
if [[ "${1:-}" == "--test" ]]; then ./build/engine_tests data/campus.json; fi
