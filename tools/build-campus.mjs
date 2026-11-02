// Compiles a campus *source* file (authored or OSM-imported) into the runtime
// dataset consumed by the C++ routing engine, the backend and the 3D frontend.
//
//   node tools/build-campus.mjs [--source data/source/campus.estimated.source.json] [--out data/campus.json]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as G from './geo.mjs';
import { validateCampus } from './validate-campus.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export function compile(source) {
  const sidewalkOffset = (w) => w / 2 + 2.5;
  const sourceRoads = source.roads || [];

  // ---- 1. sidewalks along carriageways, trimmed where a road ends on another road
  const ways = (source.ways || []).filter((w) => w.walkable !== false).map((w) => ({ ...w, pts: w.points.map((p) => [...p]) }));
  let swId = 0;
  for (const r of sourceRoads) {
    if (!r.sidewalks) continue;
    const off = sidewalkOffset(r.width);
    for (const side of [1, -1]) {
      let pts = G.offsetPolyline(r.points, side * off);
      for (const end of [0, 1]) {
        const endPt = end ? r.points[r.points.length - 1] : r.points[0];
        const hit = sourceRoads.find((o) => o !== r && o.class !== 'highway' && distToLine(endPt, o.points) < 1.0);
        if (!hit) continue;
        pts = trimEnd(pts, end, sidewalkOffset(hit.width));
      }
      if (pts.length >= 2) ways.push({ id: `sw${++swId}`, name: `${r.name} footpath`, kind: 'sidewalk', width: 2.4, pts, walkable: true, level: 0, road: r.id });
    }
  }

  // ---- 2. planarise: snap end points, split at T-junctions and crossings
  const TOL = 2.0;
  const segs = [];
  ways.forEach((w, wi) => { for (let i = 0; i + 1 < w.pts.length; i++) segs.push({ wi, i }); });
  const A = (s) => ways[s.wi].pts[s.i], B = (s) => ways[s.wi].pts[s.i + 1];
  // 2a snap way ends onto nearby foreign segments
  for (let wi = 0; wi < ways.length; wi++) {
    const w = ways[wi];
    for (const end of [0, w.pts.length - 1]) {
      const p = w.pts[end];
      let best = null;
      for (const s of segs) {
        if (s.wi === wi) continue;
        const pr = G.projectToSegment(p, A(s), B(s));
        if (pr.d <= TOL && pr.t > 1e-6 && pr.t < 1 - 1e-6 && (!best || pr.d < best.d)) best = pr;
      }
      // also snap to foreign vertices
      for (const o of ways) { if (o === w) continue; for (const q of o.pts) { const d = G.dist(p, q); if (d <= 1.2 && (!best || d < best.d)) best = { point: q, d }; } }
      if (best && best.d > 1e-9) { w.pts[end] = [G.round(best.point[0]), G.round(best.point[1])]; }
    }
  }
  const splits = new Map(); // key wi:i -> [{t,pt}]
  const addSplit = (s, t, pt) => { const k = s.wi + ':' + s.i; if (!splits.has(k)) splits.set(k, []); splits.get(k).push({ t, pt }); };
  // 2b vertices lying on foreign segments (T junctions)
  for (const s of segs) {
    for (let wj = 0; wj < ways.length; wj++) {
      if (wj === s.wi) continue;
      for (const v of ways[wj].pts) {
        const pr = G.projectToSegment(v, A(s), B(s));
        if (pr.d < 0.05 && pr.t > 1e-6 && pr.t < 1 - 1e-6) addSplit(s, pr.t, v);
      }
    }
  }
  // 2c proper crossings
  const bb = segs.map((s) => G.bbox([A(s), B(s)]));
  for (let a = 0; a < segs.length; a++) for (let b = a + 1; b < segs.length; b++) {
    if (segs[a].wi === segs[b].wi) continue;
    const p = bb[a], q = bb[b];
    if (p.x1 < q.x0 || q.x1 < p.x0 || p.z1 < q.z0 || q.z1 < p.z0) continue;
    const hit = G.segmentIntersection(A(segs[a]), B(segs[a]), A(segs[b]), B(segs[b]));
    if (hit) { const pt = [G.round(hit.point[0], 4), G.round(hit.point[1], 4)]; addSplit(segs[a], hit.t, pt); addSplit(segs[b], hit.u, pt); }
  }

  // ---- 3. build node/edge tables
  const nodes = []; const grid = new Map();
  const cell = (x, z) => `${Math.floor(x / 0.5)},${Math.floor(z / 0.5)}`;
  const getNode = (x, z) => {
    const cx = Math.floor(x / 0.5), cz = Math.floor(z / 0.5);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const idx of grid.get(`${cx + dx},${cz + dz}`) || []) if (Math.hypot(nodes[idx].x - x, nodes[idx].z - z) < 0.06) return idx;
    }
    nodes.push({ x, z, kind: 'junction', level: 0 });
    const k = cell(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(nodes.length - 1);
    return nodes.length - 1;
  };
  const edges = []; const pairSeen = new Set();
  const pushEdge = (a, b, w, kind) => {
    if (a === b) return null;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (pairSeen.has(key)) return null;
    pairSeen.add(key);
    edges.push({ a, b, kind: kind || w.kind, name: w.name, width: w.width || 3, level: w.level || 0 });
    return edges.length - 1;
  };
  ways.forEach((w, wi) => {
    const verts = [];
    for (let i = 0; i + 1 < w.pts.length; i++) {
      verts.push(w.pts[i]);
      const sp = (splits.get(wi + ':' + i) || []).sort((x, y) => x.t - y.t);
      for (const s of sp) verts.push(s.pt);
    }
    verts.push(w.pts[w.pts.length - 1]);
    let prev = null;
    for (const v of verts) {
      const id = getNode(v[0], v[1]);
      if (prev !== null) pushEdge(prev, id, w);
      prev = id;
    }
  });

  // ---- 4. classify crossings (edge lying inside a carriageway, not parallel to it)
  for (const e of edges) {
    if (e.kind === 'stairs' || e.kind === 'elevator') continue;
    const a = [nodes[e.a].x, nodes[e.a].z], b = [nodes[e.b].x, nodes[e.b].z];
    const mid = G.lerp(a, b, 0.5);
    for (const r of sourceRoads) {
      if (r.class === 'highway') continue;
      const { d, dir } = nearestOnLine(mid, r.points);
      if (d < r.width / 2 - 0.3) {
        const ed = G.norm(G.sub(b, a));
        if (Math.abs(G.dot(ed, dir)) < 0.85) { e.kind = 'crossing'; e.crosses = r.name; }
      }
    }
  }

  // ---- 5. entrances
  const places = source.places.map((p) => ({ ...p }));
  const sideN = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  const nearestGraph = (pt) => {
    let best = null;
    edges.forEach((e, i) => {
      const pr = G.projectToSegment(pt, [nodes[e.a].x, nodes[e.a].z], [nodes[e.b].x, nodes[e.b].z]);
      if (e.kind === 'entrance') return;
      if (!best || pr.d < best.d) best = { ...pr, edge: i };
    });
    return best;
  };
  const splitEdgeAt = (ei, pt) => {
    const e = edges[ei];
    const a = nodes[e.a], b = nodes[e.b];
    for (const [idx, n] of [[e.a, a], [e.b, b]]) if (Math.hypot(n.x - pt[0], n.z - pt[1]) < 0.8) return idx;
    nodes.push({ x: G.round(pt[0], 3), z: G.round(pt[1], 3), kind: 'junction', level: e.level || 0 });
    const m = nodes.length - 1;
    const old = { ...e };
    pairSeen.delete(old.a < old.b ? `${old.a}|${old.b}` : `${old.b}|${old.a}`);
    edges[ei] = { ...old, a: old.a, b: m };
    pairSeen.add(old.a < m ? `${old.a}|${m}` : `${m}|${old.a}`);
    edges.push({ ...old, a: m, b: old.b });
    pairSeen.add(m < old.b ? `${m}|${old.b}` : `${old.b}|${m}`);
    return m;
  };
  const otherSolids = (self) => places.filter((q) => q !== self && q.height > 1 && q.render !== 'gate' && q.render !== 'fountain' && q.render !== 'theatre');
  for (const p of places) {
    p.entrances = [];
    const want = p.entranceCount || (['cricket', 'football', 'stadium', 'auditorium'].includes(p.render) ? 2 : 1);
    const chosen = [];
    if (p.entrance) {
      const q = nearestGraph([p.entrance.x, p.entrance.z]);
      chosen.push({ at: [p.entrance.x, p.entrance.z], q });
    } else {
      const fp = p.footprint, orient = Math.sign(G.polygonArea(fp)) || 1;
      const cand = [];
      const blockers = otherSolids(p);
      for (let i = 0; i < fp.length; i++) {
        const a = fp[i], b = fp[(i + 1) % fp.length];
        const L = G.dist(a, b), n = Math.max(1, Math.ceil(L / 2));
        const dir = G.norm(G.sub(b, a));
        // outward normal (polygon orientation aware): for +area in x-east/z-south coords, outward = (dz,-dx)
        const out = orient > 0 ? [dir[1], -dir[0]] : [-dir[1], dir[0]];
        for (let k = 0; k <= n; k++) {
          const s = G.lerp(a, b, k / n);
          const tip = [s[0] + out[0] * 0.5, s[1] + out[1] * 0.5];
          const q = nearestGraph(tip);
          if (!q) continue;
          const crosses = blockers.some((o) => G.pointInPolygon(q.point, o.footprint) || segHitsPoly(tip, q.point, o.footprint));
          if (crosses) continue;
          const want0 = p.entranceSide && sideN[p.entranceSide];
          const match = want0 ? G.dot(out, want0) > 0.7 : true;
          cand.push({ at: tip, q, cost: q.d + (match ? 0 : 25), out });
        }
      }
      cand.sort((x, y) => x.cost - y.cost);
      for (const c of cand) {
        if (chosen.length >= want) break;
        if (chosen.every((o) => G.dist(o.at, c.at) > 30)) chosen.push(c);
      }
    }
    if (!chosen.length) throw new Error(`no entrance route for place ${p.id}`);
    chosen.forEach((c, k) => {
      const q = nearestGraph(c.at);
      let entNode;
      if (q.d < 0.8) {
        entNode = splitEdgeAt(q.edge, q.point);
      } else {
        const j = splitEdgeAt(q.edge, q.point);
        nodes.push({ x: G.round(c.at[0], 3), z: G.round(c.at[1], 3), kind: 'entrance', level: 0 });
        entNode = nodes.length - 1;
        edges.push({ a: entNode, b: j, kind: 'entrance', name: `${p.name} entrance path`, width: 2.6, level: 0 });
        pairSeen.add(entNode < j ? `${entNode}|${j}` : `${j}|${entNode}`);
      }
      nodes[entNode].kind = 'entrance';
      nodes[entNode].place = p.id;
      p.entrances.push(entNode);
    });
  }

  // ---- 6. keep the main component only, then assign stable ids
  const adj = nodes.map(() => []);
  edges.forEach((e, i) => { adj[e.a].push(e.b); adj[e.b].push(e.a); });
  const comp = new Array(nodes.length).fill(-1); const sizes = [];
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const id = sizes.length; let n = 0; const st = [s]; comp[s] = id;
    while (st.length) { const u = st.pop(); n++; for (const v of adj[u]) if (comp[v] < 0) { comp[v] = id; st.push(v); } }
    sizes.push(n);
  }
  const mainC = sizes.indexOf(Math.max(...sizes));
  const keep = nodes.map((n, i) => comp[i] === mainC);
  for (const p of places) for (const i of p.entrances) if (!keep[i]) throw new Error(`place "${p.id}" entrance is not connected to the main walking network (island component) - add a connecting footpath/crossing`);
  const newId = new Map(); let cnt = 0;
  nodes.forEach((n, i) => {
    if (!keep[i]) return;
    newId.set(i, n.kind === 'entrance' && n.place ? `ent-${n.place}-${places.find((p) => p.id === n.place).entrances.indexOf(i)}` : `n${++cnt}`);
  });
  const outNodes = [];
  nodes.forEach((n, i) => { if (keep[i]) outNodes.push({ id: newId.get(i), x: G.round(n.x, 3), z: G.round(n.z, 3), level: n.level || 0, kind: n.kind }); });
  const outEdges = [];
  edges.forEach((e) => {
    if (!keep[e.a] || !keep[e.b]) return;
    const a = nodes[e.a], b = nodes[e.b];
    outEdges.push({ id: `ed${outEdges.length + 1}`, a: newId.get(e.a), b: newId.get(e.b), len: G.round(G.dist([a.x, a.z], [b.x, b.z]), 3), kind: e.kind, name: e.name, ...(e.crosses ? { crosses: e.crosses } : {}), width: e.width, level: e.level || 0 });
  });
  const entMap = new Map(); nodes.forEach((n, i) => keep[i] && entMap.set(i, newId.get(i)));
  const outPlaces = places.map((p) => {
    const { entrance, entranceSide, entranceCount, ...rest } = p;
    return { ...rest, centroid: G.polygonCentroid(p.footprint).map((v) => G.round(v, 2)), entrances: p.entrances.map((i) => entMap.get(i)) };
  });

  // ---- 7. landmark hints for turn-by-turn text (nearest named place within 35 m)
  const named = outPlaces.filter((p) => p.kind !== 'parking');
  for (const n of outNodes) {
    let best = null;
    for (const p of named) {
      const d = G.distPointToPolygon([n.x, n.z], p.footprint);
      if (d <= 35 && (!best || d < best.d)) best = { d, p };
    }
    if (best) n.landmark = best.p.name;
  }

  const counts = (key) => outPlaces.reduce((m, p) => ((m[p[key]] = (m[p[key]] || 0) + 1), m), {});
  const runtime = {
    schema: 'cu-campus/1',
    meta: {
      ...source.meta,
      coordinateSystem: 'Local tangent plane, metres. x = east, z = south (north is -z). Origin = meta.origin (lat/lon).',
      quality: {
        geometry: counts('geometrySource'), nameConfidence: counts('nameConfidence'),
        statement: source.meta.status === 'ESTIMATED'
          ? 'All building positions, footprints, heights and path alignments are estimates. Only a subset of names is confirmed by CU pages. Routes are indicative, not surveyed.'
          : 'Geometry imported from OpenStreetMap contributors (ODbL). Heights are tag-derived or defaulted to three storeys.',
      },
      sourceHash: crypto.createHash('sha1').update(JSON.stringify(source)).digest('hex').slice(0, 12),
    },
    origin: source.origin,
    boundary: source.boundary,
    places: outPlaces,
    roads: sourceRoads,
    areas: source.areas || [],
    scenery: source.scenery || [],
    graph: { nodes: outNodes, edges: outEdges },
  };
  return runtime;
}

function distToLine(p, pts) { return nearestOnLine(p, pts).d; }
function nearestOnLine(p, pts) {
  let best = { d: Infinity, dir: [1, 0] };
  for (let i = 0; i + 1 < pts.length; i++) {
    const pr = G.projectToSegment(p, pts[i], pts[i + 1]);
    if (pr.d < best.d) best = { d: pr.d, dir: G.norm(G.sub(pts[i + 1], pts[i])) };
  }
  return best;
}
function trimEnd(pts, end, by) {
  pts = pts.map((p) => [...p]);
  let remaining = by;
  while (pts.length >= 2 && remaining > 0) {
    const i = end ? pts.length - 1 : 0, j = end ? pts.length - 2 : 1;
    const L = G.dist(pts[i], pts[j]);
    if (L > remaining + 1e-6) { pts[i] = G.lerp(pts[i], pts[j], remaining / L).map((v) => G.round(v)); remaining = 0; }
    else { remaining -= L; pts.splice(i, 1); }
  }
  return pts;
}
function segHitsPoly(a, b, poly) {
  for (let i = 0; i < poly.length; i++) if (G.segmentIntersection(a, b, poly[i], poly[(i + 1) % poly.length])) return true;
  return false;
}

export function toGeoJSON(c) {
  const ll = (p) => { const r = G.enuToLatLon(c.origin, p[0], p[1]); return [G.round(r.lon, 7), G.round(r.lat, 7)]; };
  const ring = (poly) => [[...poly, poly[0]].map(ll)];
  const nid = new Map(c.graph.nodes.map((n) => [n.id, n]));
  return {
    type: 'FeatureCollection',
    properties: { name: c.meta.name, status: c.meta.status, note: c.meta.quality.statement },
    features: [
      ...c.places.map((p) => ({ type: 'Feature', properties: { kind: 'place', id: p.id, name: p.name, category: p.kind, nameConfidence: p.nameConfidence, geometrySource: p.geometrySource }, geometry: { type: 'Polygon', coordinates: ring(p.footprint) } })),
      ...c.roads.map((r) => ({ type: 'Feature', properties: { kind: 'road', id: r.id, name: r.name, width: r.width }, geometry: { type: 'LineString', coordinates: r.points.map(ll) } })),
      ...c.graph.edges.map((e) => ({ type: 'Feature', properties: { kind: 'walk-edge', id: e.id, name: e.name, edgeKind: e.kind, length_m: e.len }, geometry: { type: 'LineString', coordinates: [nid.get(e.a), nid.get(e.b)].map((n) => ll([n.x, n.z])) } })),
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const src = path.resolve(arg('--source', path.join(ROOT, 'data/source/campus.estimated.source.json')));
  const out = path.resolve(arg('--out', path.join(ROOT, 'data/campus.json')));
  const source = JSON.parse(fs.readFileSync(src, 'utf8'));
  const runtime = compile(source);
  const { errors, warnings, stats } = validateCampus(runtime, { strict: runtime.meta.status === 'ESTIMATED' });
  warnings.forEach((w) => console.warn('warn:', w));
  if (errors.length) { errors.forEach((e) => console.error('ERROR:', e)); process.exit(1); }
  fs.writeFileSync(out, JSON.stringify(runtime));
  fs.writeFileSync(out.replace(/\.json$/, '.geojson'), JSON.stringify(toGeoJSON(runtime)));
  console.log(`built ${path.relative(process.cwd(), out)} - ${stats.nodes} nodes, ${stats.edges} edges, ${stats.places} places (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
}
