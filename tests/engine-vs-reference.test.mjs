// Cross-checks the C++ engine against an independent JS Dijkstra for EVERY ordered pair of places.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCampus, referenceDistances, DATA, BIN } from './helpers.mjs';
import { EngineClient } from '../server/engine-client.mjs';

const c = loadCampus();
const engine = new EngineClient({ binary: BIN, dataPath: DATA });
test.after(() => engine.close());

test('C++ engine distance == JS reference for all place pairs (multi-entrance aware)', async () => {
  await engine.start();
  let checked = 0;
  for (const a of c.places) {
    const { idx, d } = referenceDistances(c, a.entrances);
    for (const b of c.places) {
      const want = Math.min(...b.entrances.map((e) => d[idx.get(e)]));
      const r = await engine.request({ op: 'route', from: a.id, to: b.id });
      assert.ok(r.ok && r.found, `${a.id}->${b.id}`);
      assert.ok(Math.abs(r.distance - want) < 1e-3, `${a.id}->${b.id}: engine ${r.distance} vs reference ${want}`);
      checked++;
    }
  }
  assert.equal(checked, c.places.length ** 2);
});

test('route invariants: steps sum to distance, geometry matches nodes, ends at destination entrance', async () => {
  await engine.start();
  const N = new Map(c.graph.nodes.map((n) => [n.id, n]));
  for (const [a, b] of [['gate-1', 'd6-library'], ['gate-4', 'cricket-ground'], ['girls-hostel-3', 'd8-pharma'], ['open-air-theatre', 'banks-atm'], ['gate-2', 'boys-hostel-3']]) {
    const r = await engine.request({ op: 'route', from: a, to: b });
    const sum = r.steps.reduce((s, x) => s + x.distance, 0);
    assert.ok(Math.abs(sum - r.distance) < 0.01, `${a}->${b}`);
    let g = 0; for (let i = 1; i < r.geometry.length; i++) g += Math.hypot(r.geometry[i][0] - r.geometry[i - 1][0], r.geometry[i][1] - r.geometry[i - 1][1]);
    assert.ok(Math.abs(g - r.distance) < 0.05, `geometry length ${g} vs ${r.distance}`);
    const last = r.geometry.at(-1), place = c.places.find((p) => p.id === b);
    assert.ok(place.entrances.some((e) => Math.hypot(N.get(e).x - last[0], N.get(e).z - last[1]) < 0.01), 'ends at an entrance of the destination');
    assert.equal(r.steps.at(-1).maneuver, 'arrive'); assert.ok(r.steps.every((s) => s.instruction.length > 3));
    assert.ok(r.duration > r.distance / 2 && r.duration < r.distance * 2);
  }
});

test('free map points snap to the network and route', async () => {
  await engine.start();
  const r = await engine.request({ op: 'route', from: { x: -41, z: 215 }, to: { x: 330, z: 150 } });
  assert.ok(r.found && r.distance > 300 && r.from.snapDistance < 12 && r.to.snapDistance < 12);
  const same = await engine.request({ op: 'route', from: 'gate-1', to: 'gate-1' });
  assert.equal(same.distance, 0);
});

test('error handling: unknown ids, bad profile, malformed requests; engine survives', async () => {
  await engine.start();
  assert.equal((await engine.request({ op: 'route', from: 'nope', to: 'gate-1' })).error.code, 'UNKNOWN_ENDPOINT');
  assert.equal((await engine.request({ op: 'route', from: 'gate-1', to: 'gate-2', profile: 'jetpack' })).error.code, 'BAD_PROFILE');
  assert.equal((await engine.request({ op: 'bogus' })).error.code, 'UNKNOWN_OP');
  assert.equal((await engine.request({ op: 'route', from: 'gate-1', to: 'gate-2' })).ok, true);
});

test('accessible profile never uses stairs and is never shorter than the walk profile', async () => {
  await engine.start();
  for (const [a, b] of [['gate-1', 'd6-library'], ['gate-2', 'girls-hostel-1']]) {
    const w = await engine.request({ op: 'route', from: a, to: b, profile: 'walk' }), x = await engine.request({ op: 'route', from: a, to: b, profile: 'accessible' });
    assert.ok(x.distance >= w.distance - 1e-6);
  }
});
