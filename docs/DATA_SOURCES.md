# Data sources, verification status and limitations

This document is deliberately blunt about what is real and what is not.

## Bottom line

**The bundled campus layout is an estimate.** Building positions, footprints, heights and the
alignment of roads and footpaths were hand-authored (`tools/author-layout.mjs`). They are *not*
surveyed, *not* official, and were *not* derived from CU's 3D tour. Walking distances and routes
are computed correctly **on that estimated geometry**; they are indicative, not measured on site.

## What was researched and what it yielded

| Source | What it gave | What it could not give |
|---|---|---|
| `https://www.cuchd.in/maps/` | Address (Gharuan, Mohali), a "View in Google Maps" link, a distance-calculator tool | No block names, gates, coordinates, GIS/3D assets |
| `https://iviewd.com/cu2/` (360° virtual tour, by a third-party vendor) | Page metadata: reference coordinate **30.7668 N, 76.5781 E**; categories (academic blocks, hostels, labs, sports) | The tour is a 360° image viewer: no 3D model, no scene data, no building names. Scraping its image tiles or private endpoints would be neither lawful nor useful, so it was not attempted |
| CU blog "Top places at Chandigarh University" | Verified names: **Kalpana Chawla Block**, **Food Republic**, **D6 Library**, **Knowledge Resource Centre (KRC)**, **Central Library**, **Fountain Area**, **Sports Complex** | Positions, sizes, directions |
| CU hostel page | Separate Boys' and Girls' hostels exist | Hostel block names/locations |
| CollegeSearch gallery captions | Names **Gate 1**, **Gate 2**, **Gate 4**, **Main Gate**; NH-95/NH-05 highway frontage | Which gate is where |
| GetMyUni facilities page | Facility *types*: auditorium, open-air theatre, medical centre, SBI/HDFC banks, pool, courts, football/cricket grounds, labs | Names/positions |
| Wikipedia "Chandigarh University" | Campus area (40 ha / 100 acres; other sites say 250 acres) | Its coordinates (31.7529 N, 74.5969 E) are **wrong** — that is near Amritsar, ~190 km away. Not used |

Sources disagree on campus area (100 vs 250 acres) and highway name (NH-05 vs NH-95). The layout
spans roughly 1.06 km × 0.84 km (~89 ha), i.e. closer to the larger figures; it is a plausible envelope, not a measurement.

## Per-feature confidence (shown in the UI)

Every place carries two independent tags in `data/campus.json`:

* `nameConfidence`
  * `verified` – the exact name appears on a CU page/blog or a public listing (Gate 1/2/4, Kalpana Chawla Block, Food Republic, D6 Library, Central Library, Fountain Plaza, Sports Complex).
  * `type-only` – that *kind* of facility is reported to exist on campus; the label is ours (e.g. "Medical Centre", "Open-Air Theatre", "Boys' Hostel 2").
  * `placeholder` – invented plausible label (e.g. "Academic Block D", "Engineering Block A"). **Real CU block codes should replace these.**
* `geometrySource` – `estimated` for everything bundled; `osm` for imported data.

## Why no real 3D assets / footprints were used

* No downloadable, licensed CU 3D model or CAD/GIS export exists on the official pages.
* OpenStreetMap is the right lawful source (ODbL, attribution required), but the sandbox this was
  built in could only reach package registries — Overpass, Nominatim, tile servers and
  Geofabrik were all blocked (HTTP 403 from the egress proxy). So **no OSM data could be fetched**,
  and the importer below has **never been run against live OSM data**.

## How to replace the estimate with real data (recommended next step)

```bash
npm run import:osm -- --bbox 30.752,76.560,30.782,76.600     # needs internet (Overpass API)
node tools/build-campus.mjs --source data/source/campus.osm.source.json
npm run build:engine && npm start
```

`tools/import-osm.mjs` converts buildings, roads, footpaths, steps, crossings, pitches, parking and
named gates. Named buildings become routable places; unnamed ones become scenery. Heights come from
`height` / `building:levels` or default to 3 storeys. Imported data is tagged `geometrySource: osm` and the UI/attribution
switch automatically. Expect to hand-fix: missing footpaths (campus paths are often unmapped), names,
and entrances. You can also hand-edit the source JSON: surveying a handful of building entrances and
path junctions with a phone GPS and adding them is the most valuable improvement per hour of effort.

Other options for exact geometry: ask CU's estates department for a site plan/CAD (`.dwg`) or
GIS export; trace footprints from a licensed satellite layer you have rights to use; or load a
licensed `.glb` — the route graph is independent of the render meshes, so a model can be dropped
in and aligned using `meta.origin`.

## Testing limits

* The importer is tested against a **synthetic** Overpass-format fixture (`tests/fixtures/overpass-synthetic.json`), not real OSM.
* Walking times use a flat 1.35 m/s (stairs 0.6, crossings 1.2). No elevation, gate opening hours, or pedestrian-vs-vehicle access rules.
* Routes were never walked on site.
