# Architecture

```
 ┌───────────────────────────── browser (public/) ─────────────────────────────┐
 │ Three.js scene   world.js  buildings, roads, footpaths, landmarks, trees      │
 │ stage.js         camera, orbit controls, lighting, tweens                     │
 │ labels.js        HTML labels w/ collision culling                             │
 │ route-view.js    animated route ribbon, pins, walk preview                    │
 │ main.js          UI: search, fields, steps, picking, data-quality dialog      │
 │ search.js        fuzzy place search (shared with the server)                  │
 └───────────────▲──────────────────────────────────────────────────────────────┘
                 │ HTTP/JSON  GET /api/campus  GET|POST /api/route  GET /api/search
 ┌───────────────┴────────── backend (server/) – Node, zero npm deps ───────────┐
 │ server.mjs        REST API, validation, static hosting, CSP                   │
 │ engine-client.mjs supervises the C++ process, JSON-lines RPC, auto-restart    │
 └───────────────▲──────────────────────────────────────────────────────────────┘
                 │ stdin/stdout, one JSON object per line
 ┌───────────────┴────────── routing engine (engine/) – C++17, no deps ─────────┐
 │ graph.cpp       load + validate the pedestrian network                        │
 │ router.cpp      Dijkstra (binary heap) · multi-source/target · edge snapping  │
 │ directions.cpp  turn-by-turn from bearings, crossings, stairs, landmarks      │
 │ protocol.cpp    request/response handling (ping/info/route/snap/reload)       │
 │ main.cpp        CLI: serve | route | info                                     │
 └───────────────▲──────────────────────────────────────────────────────────────┘
                 │ data/campus.json  (generated – never hand-edited)
 ┌───────────────┴────────── data pipeline (tools/) ────────────────────────────┐
 │ author-layout.mjs   estimated layout  ─┐                                      │
 │ import-osm.mjs      OpenStreetMap      ─┴─> data/source/*.source.json         │
 │ build-campus.mjs    sidewalks → planarise → entrances → classify → landmark   │
 │ validate-campus.mjs integrity checks (also used by tests)                     │
 └──────────────────────────────────────────────────────────────────────────────┘
```

## Key decisions

* **One source of truth, generated graph.** Authors/importers draw *geometry* (footpath polylines, road centre lines, footprints). `build-campus.mjs` derives the routing graph from it: sidewalks are offset from carriageways and trimmed where roads meet, all walkable polylines are planarised (T-junctions and crossings become nodes), and **every edge length is computed from coordinates** – nothing is typed in by hand, so distances cannot drift from the picture. Edges that lie inside a carriageway are classified as crossings (zebra markings are drawn for them).
* **Entrances are first-class.** Each place gets entrance nodes found by sampling its footprint boundary, preferring a hinted side, rejecting spurs that pass through other buildings. Routing to a place is multi-source/multi-target Dijkstra over its entrances, so the best door is chosen automatically.
* **Arbitrary map points** are snapped onto the nearest edge with *virtual nodes* (including two points on one edge), so a click anywhere gives a legal route.
* **C++ engine as a long-lived process.** Per-request process spawning (the starter's approach) costs milliseconds and re-parses JSON each time. The engine loads the graph once; a query takes ~10 µs. The Node side is a thin supervisor with timeouts and auto-restart.
* **No framework, no build step** on the frontend; Three.js is vendored (`public/vendor/three`, MIT) so the app runs offline with a strict CSP (`script-src 'self'`). All textures are generated procedurally – no image assets to license.
* **Search is shared code** (`public/js/search.js`) used by both browser and API tests.

## Modules and extension points

| To add… | Touch |
|---|---|
| A building / path | `data/source/*.json` (or `tools/author-layout.mjs`), then `npm run build:data` |
| A new landmark renderer | add a `render` type in `public/js/world.js` (`addXxx`) |
| A routing profile (e.g. night-safe, covered-walkway) | `Router::edgeCost` in `engine/src/router.cpp`, `Profile` enum, protocol parse |
| Real 3D models | load a `.glb` in `world.js`, align via `meta.origin`; the graph is independent |
| Indoor navigation | see `INDOOR_NAVIGATION.md` |
| A new API | `server/server.mjs` |

## Algorithm notes

Dijkstra with a binary min-heap, `O((V+E) log V)`. All weights are positive (validated on load), so
the first goal popped is optimal and the search stops there. For the 281-node campus a query expands
< 150 nodes (~10–60 µs). Correctness is checked against Floyd–Warshall on 400 random graphs
(including unreachable pairs, multi-source and the accessible profile) in C++, and against an independent
JS Dijkstra for all 1,936 ordered place pairs through the full stack.
