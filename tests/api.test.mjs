import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/server.mjs';
import { loadCampus } from './helpers.mjs';
import { buildIndex, searchPlaces } from '../public/js/search.js';

let srv, base; const campus = loadCampus();
test.before(async () => { srv = await createServer({ port: 0, log: false }); base = srv.url; });
test.after(() => srv.close());
const get = async (p, init) => { const r = await fetch(base + p, init); return { r, j: r.headers.get('content-type')?.includes('json') ? await r.json() : null }; };

test('health reports the C++ engine', async () => { const { r, j } = await get('/api/health'); assert.equal(r.status, 200); assert.equal(j.ok, true); assert.equal(j.engine.engine, 'cu-campus-route-engine'); assert.equal(j.engine.places, campus.places.length); });
test('campus endpoint serves the dataset with ETag + gzip', async () => {
  const { r, j } = await get('/api/campus'); assert.equal(r.status, 200); assert.equal(j.schema, 'cu-campus/1');
  const again = await fetch(base + '/api/campus', { headers: { 'If-None-Match': r.headers.get('etag') } }); assert.equal(again.status, 304);
});
test('route by place ids', async () => {
  const { r, j } = await get('/api/route?from=gate-1&to=d6-library'); assert.equal(r.status, 200); assert.ok(j.found && j.distance > 300 && j.steps.length > 3 && j.geometry.length > 3);
});
test('route by POST with map points', async () => {
  const { r, j } = await get('/api/route', { method: 'POST', body: JSON.stringify({ from: { x: 10, z: 300 }, to: 'gate-4', profile: 'accessible' }) }); assert.equal(r.status, 200); assert.equal(j.profile, 'accessible'); assert.ok(j.found);
});
test('route with visualize=true returns algorithm event trace', async () => {
  const { r, j } = await get('/api/route?from=gate-1&to=d6-library&visualize=true');
  assert.equal(r.status, 200);
  assert.ok(j.found);
  assert.ok(Array.isArray(j.trace) && j.trace.length > 10);
  assert.equal(j.trace[0].type, 'init');
  assert.equal(j.trace.at(-1).type, 'done');
});
test('validation: missing/unknown/oversized inputs give 4xx JSON errors', async () => {
  for (const [p, code] of [['/api/route', 400], ['/api/route?from=gate-1', 400], ['/api/route?from=zzz&to=gate-1', 400], ['/api/route?from=gate-1&to=gate-2&profile=x', 400], ['/api/route?from=99999,0&to=gate-1', 400], ['/api/nothing', 404]]) {
    const { r, j } = await get(p); assert.equal(r.status, code, p); assert.equal(j.ok, false);
  }
  const big = await get('/api/route', { method: 'POST', body: 'x'.repeat(6000) }); assert.equal(big.r.status, 413);
  const bad = await get('/api/route', { method: 'POST', body: '{nope' }); assert.equal(bad.r.status, 400);
  assert.equal((await fetch(base + '/api/route', { method: 'DELETE' })).status, 405);
});
test('static files: index served, path traversal blocked, SPA fallback', async () => {
  const idx = await fetch(base + '/'); assert.equal(idx.status, 200); assert.match(await idx.text(), /CU Campus Navigator/);
  assert.match(idx.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(base + '/js/world.js')).status, 200);
  for (const p of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/server/server.mjs', '/js/../../data/campus.json']) { const r = await fetch(base + p); assert.ok([403, 404].includes(r.status) || (await r.text()).includes('<!doctype html>'), p); const t = r.status === 200 ? await r.text() : ''; assert.ok(!t.includes('"name": "cu-campus-nav"') && !t.includes('createServer'), p); }
  assert.equal((await fetch(base + '/missing.js')).status, 404);
});
test('search API & shared search module rank sensibly', async () => {
  const { j } = await get('/api/search?q=lib'); assert.ok(j.results.some((r) => r.id === 'd6-library'), 'lib search must find d6-library');
  const idx = buildIndex(campus.places);
  const top = (q) => searchPlaces(idx, q, 3)[0]?.place.id;
  assert.equal(top('food republic'), 'food-republic'); assert.equal(top('gate 4'), 'gate-4'); assert.equal(top('krc'), 'd6-library'); assert.equal(top('kalpana'), 'b4-engineering');
  assert.equal(top('libary'), 'd6-library');
  assert.equal(top('moot court'), 'law-block'); assert.equal(top('dsw'), 'b3-engineering'); assert.equal(searchPlaces(idx, '', 5).length, 0); assert.equal(searchPlaces(idx, 'zzzzqqq', 5).length, 0);
});
test('concurrent routing requests are all answered correctly', async () => {
  const ids = campus.places.map((p) => p.id);
  const rs = await Promise.all(Array.from({ length: 60 }, (_, i) => get(`/api/route?from=${ids[i % ids.length]}&to=${ids[(i * 7 + 3) % ids.length]}`)));
  for (const { r, j } of rs) { assert.equal(r.status, 200); assert.ok(j.found); }
});
test('engine crash is detected and the engine is restarted', async () => {
  srv.engine.proc.kill('SIGKILL'); await new Promise((r) => setTimeout(r, 900));
  let ok = false; for (let i = 0; i < 10 && !ok; i++) { const { r } = await get('/api/route?from=gate-1&to=gate-2').catch(() => ({ r: { status: 0 } })); ok = r.status === 200; if (!ok) await new Promise((r) => setTimeout(r, 300)); }
  assert.ok(ok, 'engine recovered');
});
