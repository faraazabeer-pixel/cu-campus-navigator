import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCampus, referenceDistances } from './helpers.mjs';
import { validateCampus } from '../tools/validate-campus.mjs';
import { polygonArea, dist } from '../tools/geo.mjs';

const c = loadCampus();

test('dataset passes full integrity validation (strict)', () => {
  const { errors, stats } = validateCampus(c, { strict: true });
  assert.deepEqual(errors, []);
  assert.ok(stats.places >= 40 && stats.components === 1, JSON.stringify(stats));
});

test('every place has at least one entrance in the walking network and a positive footprint', () => {
  const ids = new Set(c.graph.nodes.map((n) => n.id));
  for (const p of c.places) { assert.ok(p.entrances.length >= 1, p.id); for (const e of p.entrances) assert.ok(ids.has(e), `${p.id}:${e}`); assert.ok(Math.abs(polygonArea(p.footprint)) > 4, p.id); }
});

test('edge lengths equal Euclidean geometry (no hand-typed distances)', () => {
  const N = new Map(c.graph.nodes.map((n) => [n.id, n]));
  for (const e of c.graph.edges) { const a = N.get(e.a), b = N.get(e.b); assert.ok(Math.abs(dist([a.x, a.z], [b.x, b.z]) - e.len) < 0.01, e.id); }
});

test('data honesty: every place states name confidence and geometry source; none claims verified geometry', () => {
  const allowed = new Set(['verified', 'type-only', 'placeholder', 'osm']);
  for (const p of c.places) { assert.ok(allowed.has(p.nameConfidence), p.id); assert.equal(p.geometrySource, 'estimated', p.id); }
  assert.equal(c.meta.status, 'ESTIMATED');
  assert.match(c.meta.quality.statement, /estimat/i);
});

test('verified names match the sources recorded in metadata', () => {
  const srcIds = new Set(c.meta.sources.map((s) => s.id));
  for (const p of c.places) for (const s of p.sources) assert.ok(srcIds.has(s), `${p.id} cites unknown source ${s}`);
  for (const p of c.places.filter((q) => q.nameConfidence === 'verified')) assert.ok(p.sources.length > 0, p.id);
});

test('required landmark types are present', () => {
  const ids = new Set(c.places.map((p) => p.id));
  for (const id of ['gate-1', 'gate-2', 'gate-4', 'd6-library', 'food-republic', 'b4-engineering', 'fountain-plaza', 'sports-complex', 'staff-quarters']) assert.ok(ids.has(id), id);
  assert.ok(c.places.filter((p) => p.kind === 'hostel').length >= 4);
  assert.ok(c.graph.edges.some((e) => e.kind === 'crossing') && c.graph.edges.some((e) => e.kind === 'sidewalk'));
  assert.ok(c.roads.length >= 10);
});

test('reference JS Dijkstra: graph is connected and every place reachable from Gate 1', () => {
  const g1 = c.places.find((p) => p.id === 'gate-1');
  const { idx, d } = referenceDistances(c, g1.entrances);
  for (const p of c.places) assert.ok(Math.min(...p.entrances.map((e) => d[idx.get(e)])) < Infinity, p.id);
});
