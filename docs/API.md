# HTTP API

Base URL: `http://localhost:5173`. All responses are JSON unless noted. Errors: `{"ok":false,"error":{"code","message"}}`.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | `200` + engine info when the C++ engine is up, else `503` |
| `GET /api/campus` | the compiled dataset (`data/campus.json`), gzip + ETag |
| `GET /api/campus.geojson` | same geometry as GeoJSON (WGS84) for GIS tools |
| `GET /api/places` | id, name, kind, aliases, confidence, centroid |
| `GET /api/search?q=lib&limit=8` | ranked fuzzy search (name, aliases, category words, 1-typo tolerance) |
| `GET /api/route?from=…&to=…&profile=walk\|accessible` | shortest route |
| `POST /api/route` | body `{"from":"gate-1","to":{"x":10,"z":300},"profile":"walk"}` |

An endpoint (`from`/`to`) is a **place id** (best entrance chosen automatically), a **graph node id**, or **`x,z`** in campus metres
(snapped to the nearest path). Coordinates: `x` east, `z` south, origin = `meta.origin`.

## Route response

```jsonc
{
  "ok": true, "found": true, "profile": "walk",
  "from": {"label": "Gate 1 (Main Gate)", "kind": "place", "id": "gate-1", "point": [-40, 420]},
  "to":   {"label": "Central Library", ...},
  "distance": 481.9,            // metres along the path
  "duration": 357.2,            // seconds (1.35 m/s walking, slower on stairs/crossings)
  "nodes": ["ent-gate-1-0", "n111", ...],       // graph nodes visited
  "geometry": [[-40,420], [-49.5,420], ...],    // polyline for drawing
  "steps": [
    {"maneuver":"depart|straight|slight-left|left|sharp-left|slight-right|right|sharp-right|cross|stairs|arrive",
     "instruction":"Turn left onto Main Avenue footpath near Fountain Plaza",
     "name":"Main Avenue footpath", "landmark":"Fountain Plaza",
     "distance":113, "duration":84, "bearing":0, "at":[x,z], "geomStart":3, "geomEnd":5}
  ],
  "stats": {"expanded": 136, "relaxed": 402, "micros": 20}   // Dijkstra work
}
```
`found:false` (HTTP 200) is returned with a `message` when no path exists (e.g. step-free requested but only stairs connect).

## Engine protocol (stdin/stdout, JSON lines)

`route_engine serve data/campus.json` → first line is the info/ready object, then one response per request line.
Ops: `ping`, `info`, `route`, `snap`, `reload`. CLI one-shot: `route_engine route data/campus.json gate-1 d6-library --pretty`.
