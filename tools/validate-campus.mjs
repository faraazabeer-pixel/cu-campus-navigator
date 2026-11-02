// Integrity checks for a compiled runtime campus (data/campus.json). Used by the
// build and by the test-suite. Returns {errors, warnings, stats}.
import { dist, polygonArea, polygonsOverlap, distPolygonToPolyline } from './geo.mjs';

export function validateCampus(c, { strict = true } = {}) {
  const errors = [], warnings = [];
  const W = (m) => warnings.push(m), E = (m) => errors.push(m), S = (m) => (strict ? E(m) : W(m)); // geometry-quality findings are only fatal for the hand-authored layout
  const nodes = new Map();
  for (const n of c.graph.nodes) {
    if (nodes.has(n.id)) E(`duplicate node id ${n.id}`);
    if (!Number.isFinite(n.x) || !Number.isFinite(n.z)) E(`node ${n.id} has non-finite coordinates`);
    nodes.set(n.id, n);
  }
  const edgeIds = new Set(), pair = new Set();
  const adj = new Map([...nodes.keys()].map((k) => [k, []]));
  for (const e of c.graph.edges) {
    if (edgeIds.has(e.id)) E(`duplicate edge id ${e.id}`);
    edgeIds.add(e.id);
    const a = nodes.get(e.a), b = nodes.get(e.b);
    if (!a || !b) { E(`edge ${e.id} references unknown node`); continue; }
    if (e.a === e.b) E(`edge ${e.id} is a self loop`);
    const L = dist([a.x, a.z], [b.x, b.z]);
    if (!(e.len > 0)) E(`edge ${e.id} has non-positive length`);
    if (Math.abs(L - e.len) > 0.01) E(`edge ${e.id} length ${e.len} != geometric ${L.toFixed(3)}`);
    const key = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
    if (pair.has(key)) E(`duplicate edge between ${e.a} and ${e.b}`);
    pair.add(key);
    adj.get(e.a).push(e.b); adj.get(e.b).push(e.a);
  }
  // connectivity
  const comp = new Map(); let nc = 0; const sizes = [];
  for (const id of nodes.keys()) {
    if (comp.has(id)) continue;
    let sz = 0; const st = [id]; comp.set(id, nc);
    while (st.length) { const u = st.pop(); sz++; for (const v of adj.get(u)) if (!comp.has(v)) { comp.set(v, nc); st.push(v); } }
    sizes.push(sz); nc++;
  }
  const main = sizes.indexOf(Math.max(...sizes));
  const seenIds = new Set();
  for (const p of c.places) {
    if (seenIds.has(p.id)) E(`duplicate place id ${p.id}`);
    seenIds.add(p.id);
    if (polygonArea(p.footprint) === 0) E(`place ${p.id} has zero-area footprint`);
    if (!p.entrances?.length) E(`place ${p.id} has no entrance`);
    for (const en of p.entrances || []) {
      if (!nodes.has(en)) E(`place ${p.id} entrance ${en} is not a graph node`);
      else if (comp.get(en) !== main) E(`place ${p.id} entrance ${en} is disconnected from the main network`);
    }
  }
  // overlaps between solid buildings
  const solid = c.places.filter((p) => p.height > 1 && p.render !== 'gate' && p.render !== 'fountain' && p.render !== 'theatre');
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    if (polygonsOverlap(solid[i].footprint, solid[j].footprint)) S(`buildings overlap: ${solid[i].id} / ${solid[j].id}`);
  }
  // buildings vs carriageways
  for (const p of c.places) {
    if (p.render === 'gate' || p.render === 'fountain') continue;
    for (const r of c.roads) {
      if (r.class === 'highway') continue;
      const d = distPolygonToPolyline(p.footprint, r.points);
      if (d < r.width / 2) S(`place ${p.id} intrudes on carriageway ${r.id} (clearance ${d.toFixed(1)} m < ${r.width / 2})`);
    }
  }
  for (const e of c.graph.edges) if (e.kind === 'entrance' && e.len > 45) W(`long entrance spur ${e.name} (${e.len.toFixed(0)} m)`);
  return { errors, warnings, stats: { nodes: nodes.size, edges: c.graph.edges.length, places: c.places.length, components: nc, mainComponentNodes: sizes[main] } };
}
