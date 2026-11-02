#!/usr/bin/env node
// Converts OpenStreetMap data (ODbL, (c) OpenStreetMap contributors) into the campus *source* schema.
//
//   node tools/import-osm.mjs --bbox 30.752,76.560,30.782,76.600            (needs internet; queries Overpass)
//   node tools/import-osm.mjs --input path/to/overpass.json [--origin lat,lon] [--out file]
//
// Then:  node tools/build-campus.mjs --source data/source/campus.osm.source.json
//
// NOT verified against live OpenStreetMap data (no network access was available when this was written);
// it is tested against a synthetic Overpass-format fixture only - see tests/osm-import.test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from './geo.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function overpassQuery(bbox) {
  const b = bbox.join(',');
  return `[out:json][timeout:90];
(
  way["building"](${b}); way["highway"](${b}); way["leisure"](${b}); way["amenity"~"^(parking|university|college|library|theatre|auditorium)$"](${b});
  way["landuse"~"^(grass|recreation_ground|forest|meadow)$"](${b}); way["natural"="water"](${b});
  node["barrier"="gate"](${b}); node["entrance"](${b}); node["name"~"[Gg]ate"](${b});
);
out geom;`;
}

const FOOT = new Set(['footway', 'path', 'pedestrian', 'steps', 'living_street', 'track', 'corridor']);
const ROAD_W = { motorway: 24, trunk: 22, primary: 16, secondary: 14, tertiary: 10, residential: 8, unclassified: 8, service: 6, living_street: 6 };
const WALKABLE_ROAD = new Set(['tertiary', 'residential', 'unclassified', 'service', 'living_street']);

function categorize(t) {
  const name = (t.name || t['name:en'] || '').toLowerCase();
  if (t.amenity === 'library' || /librar|krc/.test(name)) return 'library';
  if (/hostel|dormitor/.test(name) || t.building === 'dormitory') return 'hostel';
  if (['restaurant', 'cafe', 'food_court', 'fast_food'].includes(t.amenity) || /food|canteen|mess|cafe|court/.test(name)) return 'food';
  if (['hospital', 'clinic', 'doctors'].includes(t.amenity) || /medical|hospital|dispensary/.test(name)) return 'medical';
  if (['bank', 'atm'].includes(t.amenity) || /\bbank\b|atm/.test(name)) return 'bank';
  if (['theatre', 'auditorium'].includes(t.amenity) || /auditorium|theatre|theater/.test(name)) return 'auditorium';
  if (/admin|reception|registrar|office/.test(name)) return 'admin';
  if (t.leisure || /sport|stadium|gym|pool|court|ground/.test(name)) return 'sports';
  if (t.amenity === 'parking') return 'parking';
  return 'academic';
}
function renderOf(t, cat) {
  const sport = (t.sport || '').toLowerCase();
  if (t.leisure === 'swimming_pool' || sport === 'swimming') return 'pool';
  if (t.leisure === 'pitch' || t.leisure === 'track' || t.leisure === 'stadium') {
    if (/cricket/.test(sport)) return 'cricket';
    if (/soccer|football|athletics/.test(sport) || t.leisure === 'track' || t.leisure === 'stadium') return 'football';
    return 'court';
  }
  if (cat === 'parking') return 'parking';
  if (cat === 'auditorium') return 'auditorium';
  return 'box';
}
function courtType(t) { const s = (t.sport || '').toLowerCase(); return /basketball/.test(s) ? 'basketball' : /tennis/.test(s) ? 'tennis' : 'volleyball'; }

function heightOf(t) {
  const h = parseFloat(t.height); if (Number.isFinite(h) && h > 0) return { h, src: 'osm-height' };
  const lv = parseInt(t['building:levels'], 10); if (Number.isFinite(lv) && lv > 0) return { h: lv * 3.6, src: 'osm-levels', levels: lv };
  return { h: 10.8, src: 'default', levels: 3 };
}

/** Normalise any Overpass JSON into [{type,id,tags,pts:[[lat,lon]],closed}] ways and nodes. */
export function readOverpass(json) {
  const nodes = new Map(); const out = { ways: [], nodes: [] };
  for (const e of json.elements || []) if (e.type === 'node') { nodes.set(e.id, [e.lat, e.lon]); if (e.tags) out.nodes.push({ id: e.id, tags: e.tags, ll: [e.lat, e.lon] }); }
  for (const e of json.elements || []) {
    if (e.type !== 'way') continue;
    let pts = e.geometry ? e.geometry.map((g) => [g.lat, g.lon]) : (e.nodes || []).map((n) => nodes.get(n)).filter(Boolean);
    if (pts.length < 2) continue;
    const closed = pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    if (closed) pts = pts.slice(0, -1);
    out.ways.push({ id: e.id, tags: e.tags || {}, pts, closed });
  }
  return out;
}

export function convert(overpassJson, { origin, bbox } = {}) {
  const { ways, nodes } = readOverpass(overpassJson);
  const all = ways.flatMap((w) => w.pts);
  if (!all.length) throw new Error('no geometry found in the Overpass data');
  if (!origin) {
    if (bbox) origin = { lat: (bbox[0] + bbox[2]) / 2, lon: (bbox[1] + bbox[3]) / 2 };
    else origin = { lat: all.reduce((s, p) => s + p[0], 0) / all.length, lon: all.reduce((s, p) => s + p[1], 0) / all.length };
  }
  const toXZ = (p) => G.latLonToEnu(origin, p[0], p[1]).map((v) => G.round(v, 2));
  const places = [], scenery = [], roads = [], wayList = [], areas = [];
  const stats = { buildings: 0, namedBuildings: 0, unnamedScenery: 0, roads: 0, footways: 0, skipped: 0 };
  const used = new Set(); const slug = (s, id) => { let b = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'place'; let k = b, n = 2; while (used.has(k)) k = `${b}-${n++}`; used.add(k); return k; };

  for (const w of ways) {
    const t = w.tags; const name = t.name || t['name:en'];
    if (t.building || ((t.leisure && ['pitch', 'track', 'stadium', 'swimming_pool', 'sports_centre'].includes(t.leisure)) && w.closed) || (t.amenity === 'parking' && w.closed)) {
      if (!w.closed || w.pts.length < 3) { stats.skipped++; continue; }
      const poly = w.pts.map(toXZ); if (Math.abs(G.polygonArea(poly)) < 6) { stats.skipped++; continue; }
      const cat = categorize(t), hh = t.building ? heightOf(t) : { h: 0.2, src: 'flat', levels: 0 };
      if (t.building) stats.buildings++;
      if (name) {
        stats.namedBuildings++;
        places.push({ id: slug(name, w.id), name, aliases: [t.short_name, t.alt_name, t.old_name].filter(Boolean), kind: cat, render: renderOf(t, cat), ...(renderOf(t, cat) === 'court' ? { courtType: courtType(t) } : {}), footprint: poly, height: hh.h, levels: hh.levels ?? 0, geometrySource: 'osm', nameSource: 'osm', nameConfidence: 'osm', sources: ['src-osm'], osm: { type: 'way', id: w.id }, heightSource: hh.src });
      } else if (t.building) { stats.unnamedScenery++; scenery.push({ id: `osm-way-${w.id}`, footprint: poly, height: hh.h, kind: cat, heightSource: hh.src }); }
      continue;
    }
    if (t.highway) {
      stats.roads++;
      const pts = w.pts.map(toXZ);
      if (FOOT.has(t.highway) || (t.highway === 'footway')) {
        stats.footways++;
        const kind = t.highway === 'steps' ? 'stairs' : t.footway === 'crossing' ? 'crossing' : t.highway === 'pedestrian' ? 'plaza' : 'footpath';
        wayList.push({ id: `osm-way-${w.id}`, name: name || (kind === 'stairs' ? 'Stairs' : 'Footpath'), kind, width: parseFloat(t.width) || (kind === 'plaza' ? 5 : 2.5), points: pts, walkable: true, level: parseInt(t.level, 10) || 0 });
      } else if (ROAD_W[t.highway]) {
        const width = parseFloat(t.width) || ROAD_W[t.highway];
        roads.push({ id: `osm-way-${w.id}`, name: name || `${t.highway} road`, class: t.highway === 'motorway' || t.highway === 'trunk' ? 'highway' : 'avenue', width, points: pts, sidewalks: false });
        if (WALKABLE_ROAD.has(t.highway) || t.sidewalk) wayList.push({ id: `osm-walk-${w.id}`, name: name || `${t.highway} road`, kind: 'footpath', width: 3, points: pts, walkable: true, level: 0 });
      }
      continue;
    }
    if (w.closed && (['grass', 'meadow', 'recreation_ground', 'forest'].includes(t.landuse) || ['park', 'garden'].includes(t.leisure))) areas.push({ id: `osm-area-${w.id}`, type: 'lawn', polygon: w.pts.map(toXZ), name: name || 'Green' });
  }
  for (const n of nodes) {
    const t = n.tags, name = t.name || t['name:en'];
    if ((t.barrier === 'gate' || /gate/i.test(name || '')) && name) {
      const [x, z] = toXZ(n.ll);
      places.push({ id: slug(name), name, aliases: [], kind: 'gate', render: 'gate', footprint: G.rect(x, z, 20, 4), height: 9, levels: 1, entrance: { x, z }, geometrySource: 'osm', nameSource: 'osm', nameConfidence: 'osm', sources: ['src-osm'], osm: { type: 'node', id: n.id } });
    }
  }
  if (!places.length) throw new Error('import produced no named places - the area may lack name tags');
  const xs = [...places, ...scenery].flatMap((p) => p.footprint.map((q) => q[0])).concat(roads.flatMap((r) => r.points.map((q) => q[0])));
  const zs = [...places, ...scenery].flatMap((p) => p.footprint.map((q) => q[1])).concat(roads.flatMap((r) => r.points.map((q) => q[1])));
  const pad = 30, x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, z0 = Math.min(...zs) - pad, z1 = Math.max(...zs) + pad;
  return {
    stats,
    source: {
      schema: 'cu-campus-source/1',
      meta: {
        name: 'Chandigarh University, Mohali - OpenStreetMap import', status: 'OSM_IMPORT', generator: 'tools/import-osm.mjs',
        description: 'Geometry and names imported from OpenStreetMap. Unnamed buildings are rendered as scenery. Building heights are tag-derived or defaulted to 3 storeys.',
        sources: [{ id: 'src-osm', title: '© OpenStreetMap contributors (ODbL)', url: 'https://www.openstreetmap.org/copyright', used: `Buildings, roads, footpaths; imported ${new Date().toISOString().slice(0, 10)}.` }],
      },
      origin, boundary: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], places, scenery, roads, ways: wayList, areas,
    },
  };
}

async function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const out = path.resolve(arg('--out') || path.join(ROOT, 'data/source/campus.osm.source.json'));
  const bbox = arg('--bbox')?.split(',').map(Number);
  const origin = arg('--origin') ? (([lat, lon]) => ({ lat, lon }))(arg('--origin').split(',').map(Number)) : undefined;
  let json;
  if (arg('--input')) json = JSON.parse(fs.readFileSync(arg('--input'), 'utf8'));
  else {
    if (!bbox || bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v))) { console.error('usage: import-osm.mjs --bbox south,west,north,east | --input overpass.json [--origin lat,lon] [--out file]'); process.exit(2); }
    const endpoint = arg('--endpoint') || 'https://overpass-api.de/api/interpreter';
    console.log(`querying ${endpoint} ...`);
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'cu-campus-nav/1.0' }, body: 'data=' + encodeURIComponent(overpassQuery(bbox)) });
    if (!res.ok) { console.error(`Overpass request failed: HTTP ${res.status}`); process.exit(1); }
    json = await res.json();
    fs.writeFileSync(out.replace(/\.json$/, '.overpass.json'), JSON.stringify(json));
  }
  const { source, stats } = convert(json, { origin, bbox });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(source, null, 1));
  console.log(`wrote ${path.relative(process.cwd(), out)}: ${source.places.length} named places, ${source.scenery.length} scenery buildings, ${source.roads.length} roads, ${source.ways.length} walkable ways`);
  console.log(JSON.stringify(stats));
  console.log(`next: node tools/build-campus.mjs --source ${path.relative(process.cwd(), out)}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
