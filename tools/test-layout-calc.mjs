import fs from 'node:fs';
import { rect, ellipse, round, polygonsOverlap, distPolygonToPolyline } from './geo.mjs';

const m = JSON.parse(fs.readFileSync('public/map-reference/cu_map_manifest.json'));
const W_m = 1000;
const H_m = W_m / (2048 / 1448);

const getCoord = (id) => {
  const p = m.places.find(x => x.id === id);
  if (!p) throw new Error("Missing " + id);
  return {
    x: round(((p.anchor_px.x / 2048) - 0.5) * W_m, 1),
    z: round(((p.anchor_px.y / 1448) - 0.5) * H_m, 1),
    name: p.name,
    cat: p.category
  };
};

console.log("Calculated positions sample:");
for (const id of ['gate_1', 'gate_2', 'gate_3', 'a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'b4', 'b5', 'c1', 'c2', 'c3', 'main_ground', 'knowledge_resource_centre', 'sports_complex']) {
  console.log(id.padEnd(28), getCoord(id));
}
