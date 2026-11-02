import * as G from './geo.mjs';
import { generateLayout } from './render-d-block-preview.mjs';

const { roads, buildings, facilities, parkings } = generateLayout();

console.log('Testing proposed D-Block roads against PROPOSED D-Block buildings...');
let collisions = 0;
const allPolys = [
  ...buildings.map(b => ({ id: b.id, name: b.name, poly: b.poly })),
  ...facilities.map(f => ({ id: f.id, name: f.name, poly: f.poly })),
  ...parkings.map(p => ({ id: p.id, name: p.name, poly: p.poly }))
];

for (const r of roads) {
  for (const b of allPolys) {
    const d = G.distPolygonToPolyline(b.poly, r.points);
    const req = r.width / 2 + 0.5;
    if (d < req) {
      console.log(`Collision: road "${r.id}" (w=${r.width}) hits "${b.id}" (${b.name}), d=${d.toFixed(2)}m (req >= ${req}m)`);
      collisions++;
    }
  }
}

console.log(`\nResult: Total Collisions = ${collisions}`);
