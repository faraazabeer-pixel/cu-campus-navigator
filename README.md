# CU Campus 3D Navigator — Chandigarh University, Mohali

Interactive 3D campus map with shortest-walking-route finding.
**C++17 Dijkstra engine** · **Node.js backend (no npm runtime deps)** · **Three.js frontend**.

> ## ⚠️ Data Note: Geometry is approximate / map-derived
> Reconstructed from the official Chandigarh University Campus Guide Map ("Know Where You Are"),
> the official map manifest (`cu_map_manifest.json`) and university publications.
> Coordinates use an aspect-ratio-preserving transformation of the official 2048 × 1448 map (1.41436:1).
> Walking network graph edges represent walkable outdoor paths and sidewalks with Euclidean metric lengths.
> Routing is exact on this network; measurements and unverified geometry are marked approximate until physical on-site surveys are integrated.
> The UI displays data honesty banners, place confidence tags, and source citations.

## Features
* **Official CU Campus Map Reconstruction**:
  * **All Academic Blocks**:
    * **A1–A3**: University Institute of Biotechnology (A1), Architecture & Media Studies (A2), Liberal Arts & Humanities (A3).
    * **B1–B5**: CSE Nakoda (B1), Tourism & Hospitality (B2), CSE Vikramshila (B3), Engineering Aerospace/ECE/Civil (B4), Legal Studies / Law Block & DACA (B5).
    * **C1–C3**: Engineering Foundation CSE (C1), **CSE Takshila (C2 - placed directly below C1 on the right side of Main Ground)**, Non-CSE (C3).
    * **D1–D5, D7–D8**: MBA AIM (D1), APEX AI & ML (D2), APEX Core CSE (D3), BBA APEX (D4), Business Economics (D5), Allied Health Sciences (D7), Pharma Sciences & Nursing (D8), TBI Innovation Lab.
    * **DD1–DD4**: Institute of Sciences Maths (DD1) & Physics (DD2), Adesh Campus BBA (DD3), Commerce (DD4/DD5).
  * **All Hostels**: Tagore Hostel (south of Main Ground & C2), Zakir Residence Complex (A, B, C, D), NCT 1–6 Hostels with central Open Theater, L-C Girls Hostel, Shivalik Hostel, Sachdeva & Gobind Hostels.
  * **Gates & Landmarks**: Gate 1 (Main Gate with roundabout), Gate 2, Gate 3, Gate 8 / Gate 4 (Sports Complex Gate), VIP Gate, Academic Orientation Venue, Fountain Plaza (Musical Programme), Main Ground (Cricket & Athletic Field), Handball & Basketball Court, Sports Complex (Indoor Stadium), Olympic-size Swimming Pool, Sports Ground (West), KRC D6 Library, Central Library, UCRD, DSW, Information Centres (East & West), Cultural Performance Venue, and Visitor/Student Parking.
* **C++17 Dijkstra Engine (Source of Truth)**:
  * Multi-source, multi-entrance aware shortest-path routing.
  * Arbitrary point snapping to nearest walkable edge with virtual node insertion.
  * Deterministic min-heap priority queue tie-breaking.
  * Profiles: standard walking and step-free ("accessible") avoiding stairs.
  * Sub-microsecond query execution (~3.8 µs per query, 3,481 place pairs tested).
* **Dijkstra Visualizer Mode**:
  * Interactive step-by-step visual inspection of the C++ algorithm execution trace (`visualize=true`).
  * Controls: **Play**, **Pause**, **Step Forward**, **Step Backward**, **Reset**, and speed adjustment (**0.5x, 1x, 2x, 5x**).
  * Real-time Priority Queue (min-heap) inspector table with tentative distance rankings.
  * Live Tentative Distances table (`dist[u]`, `prev[u]`), visited/settled node counter, and candidate edge relaxation highlights.
  * 3D shortest path ribbon matching the exact C++ engine calculation.
* **Intuitive Navigation & Gesture Controls**:
  * **Trackpad pinch-to-zoom**: pinch inward to zoom in, outward spread to zoom out.
  * **Two-finger pan**: smooth directional canvas panning.
  * **Mouse drag mode toggle**: switch between rotation and ground panning.
  * **Double-click to zoom**: double-click to focus and zoom into any campus location.
  * Day and dusk lighting modes with realistic shadows and building glows.
* **Turn-by-turn directions**: landmark-guided instructions, step-by-step navigation, and deep-link URLs.

## Quick Start
Requirements: Node ≥ 18, g++ (C++17) or Clang/CMake.
```bash
npm install            # dev only (Three.js is vendored in public/vendor/three)
npm run build:engine   # compiles build/route_engine and build/engine_tests
npm run build:data     # generates data/campus.json from data/source/
npm start              # starts server at http://localhost:5173
npm run package        # generates cu-campus-nav-updated.zip
```
CLI test:
```bash
build/route_engine route data/campus.json gate-1 d6-library --profile walk --visualize
```

## Automated Test Suite
* **C++ Engine Tests** (`npm run test:engine`): **121 checks passed**
  * Floyd–Warshall equivalence cross-check on 400 random graphs.
  * Edge cases: direct routes, alternative routes, equal-cost paths, disconnected nodes, source-equals-destination.
  * Trace recording, point snapping, step-free routing, and all 3,481 place pairs.
* **Node.js Integration Tests** (`npm run test:node`): **25 tests passed**
  * Data integrity validation (strict, 0 errors, 0 warnings).
  * Reference JS Dijkstra cross-check against C++ engine for every place pair.
  * REST API routing, search ranking, concurrent load, engine supervisor crash recovery.

## Project Structure
* `engine/`: C++17 Dijkstra engine source (`router.cpp`, `graph.cpp`, `protocol.cpp`, `directions.cpp`, `main.cpp`).
* `server/`: Node.js REST server & C++ engine supervisor process (`server.mjs`, `engine-client.mjs`).
* `public/`: Three.js frontend application:
  * `js/world.js`: 3D procedural campus geometry, materials, and buildings.
  * `js/stage.js`: Three.js rendering, lighting, camera tweens, and mousepad/gesture navigation.
  * `js/dijkstra-visualizer.js`: Step-by-step Dijkstra visualizer with priority queue inspector.
  * `js/main.js`: Search, route coordination, and UI state management.
  * `map-reference/`: Official reference files (`CU_map.png`, `cu_map_manifest.json`).
* `tools/`: Data pipeline (`author-layout.mjs`, `build-campus.mjs`, `validate-campus.mjs`, `geo.mjs`).
* `data/`: Compiled runtime campus dataset (`campus.json`, `campus.geojson`).
* `tests/`: Test suite (`data.test.mjs`, `api.test.mjs`, `engine-vs-reference.test.mjs`, `importer.test.mjs`).

## Licences / Attribution
* Project code: MIT.
* Three.js (MIT) vendored in `public/vendor/three`.
