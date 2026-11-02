# Path to indoor navigation

The outdoor system was built so that indoor routing is an *additive* data change, not a rewrite.

## What is already in place

* `Node.level` (integer floor, 0 = ground) and `Edge.kind` values `stairs`, `ramp`, `elevator`, `indoor` exist in the schema, the C++ model, the profiles and the direction generator ("Take the stairs up/down").
* `Router` profiles: `accessible` already forbids `stairs`. Adding `elevator` handling or a "prefer lifts" profile is a change to `Router::edgeCost` and `Router::speed`.
* Places route via **entrance nodes**. An indoor map attaches to the same entrance node, so outdoor → indoor routes are one Dijkstra run on one graph.
* Edge classification and the `Hop`/`Step` model carry the edge kind, so UI icons and spoken text differ for indoor edges.

## Recommended steps

1. **Model a building.** Add a source file `data/source/indoor/<place-id>.json`:
   ```json
   { "place": "d6-library", "levels": [0, 1, 2, 3],
     "nodes": [{"id":"d6-l0-lobby","x":19.5,"z":47.5,"level":0,"kind":"junction"}, ...],
     "edges": [{"a":"d6-l0-lobby","b":"d6-l1-stair-a","kind":"stairs","len":9.0}, ...],
     "rooms": [{"id":"d6-l2-reading","name":"Reading Hall","level":2,"entrance":"d6-l2-n14"}] }
   ```
   Level change edges get a length equal to walking distance (stairs ≈ 9–12 m, elevators ≈ 6 m equivalent), not vertical distance.
2. **Compile.** Extend `build-campus.mjs` to merge indoor files: connect the indoor lobby node to the existing outdoor entrance node (`ent-<place>-k`) with a zero-cost-ish `entrance` edge and append nodes/edges. `rooms` become places with `parent` = building id.
3. **Render.** `world.js` already builds a Group per place. Add per-level floor plates and a level slider that sets `visible`/clipping on groups; fade other levels. Route ribbons need `y = level * 3.6`; `RouteView` takes `[x, z]` today and would take `[x, z, level]`.
4. **Directions.** `directions.cpp` already emits `stairs` steps using node levels; add "Take the lift to level N" for `elevator` edges and a "Continue indoors" transition when `Edge.kind` changes from `entrance` to `indoor`.
5. **Search.** Rooms are just places with a `parent`; `public/js/search.js` already indexes name/aliases, add the parent name to the haystack.
6. **Positioning (optional, later).** Browser geolocation works outdoors (map lat/lon through `meta.origin`); indoors use QR codes at entrances that deep-link to `#from=<node>`.

## Constraints to plan for

* Floor-plan data must come from CU (CAD/PDF) – it cannot be inferred from outside geometry.
* Per-level graphs can be large (hundreds of nodes per building); the engine handles ~10⁵ nodes comfortably, but keep a bounding-box prefilter if the campus grows to tens of buildings of indoor detail.
