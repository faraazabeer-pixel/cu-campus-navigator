// Validates the campus graph and routing engine against the Google Maps
// reference screenshots (Region 1 & Region 2) and official CU map landmarks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCampus, referenceDistances, DATA, BIN } from './helpers.mjs';
import { EngineClient } from '../server/engine-client.mjs';

const campus = loadCampus();
const engine = new EngineClient({ binary: BIN, dataPath: DATA });

test.before(async () => {
  await engine.start();
});

test.after(async () => {
  await engine.close();
});

test('all required academic blocks are present, including C2 below C1', () => {
  const blocks = [
    'a1-biotech', 'a2-architecture', 'a3-liberal-arts',
    'b1-engineering', 'b2-hospitality', 'b3-engineering', 'b4-engineering', 'law-block',
    'c1-engineering', 'c2-engineering', 'c3-engineering',
    'd1-apex-management', 'd2-engineering', 'd3-engineering', 'd4-apex-management',
    'd5-business', 'd7-allied-health', 'd8-pharma',
    'dd1-sciences', 'dd2-sciences', 'dd3-business', 'dd4-business'
  ];

  for (const id of blocks) {
    const place = campus.places.find((p) => p.id === id);
    assert.ok(place, `Academic block ${id} must exist in campus places`);
    assert.ok(place.entrances && place.entrances.length > 0, `Academic block ${id} must have entrance`);
  }

  // Verify C2 is directly below C1 on the right (east) side of Main Ground
  const c1 = campus.places.find((p) => p.id === 'c1-engineering');
  const c2 = campus.places.find((p) => p.id === 'c2-engineering');
  const mg = campus.places.find((p) => p.id === 'cricket-ground');

  // C1 and C2 should be east of Main Ground (larger x)
  assert.ok(c1.footprint[0][0] > mg.footprint[0][0], 'C1 should be east of Main Ground');
  assert.ok(c2.footprint[0][0] > mg.footprint[0][0], 'C2 should be east of Main Ground');

  // Food Republic is between C1 and C2
  const fr = campus.places.find((p) => p.id === 'food-republic');
  assert.ok(fr, 'Food Republic must exist');
  assert.ok(fr.footprint[0][0] > mg.footprint[0][0], 'Food Republic should be east of Main Ground');
  assert.ok(fr.footprint[0][1] > c1.footprint[0][1], 'Food Republic must be south of C1');
  assert.ok(c2.footprint[0][1] > fr.footprint[0][1], 'C2 should be south (below) Food Republic');

  // C3 is west of Main Ground (smaller x)
  const c3 = campus.places.find((p) => p.id === 'c3-engineering');
  assert.ok(c3, 'C3 must exist');
  assert.ok(c3.footprint[0][0] < mg.footprint[0][0], 'C3 should be west of Main Ground');

  // Staff Quarters is south of C3 towards the Boys' Hostel / Gate 4 side
  const sq = campus.places.find((p) => p.id === 'staff-quarters');
  assert.ok(sq, 'Staff Quarters must exist near C3');
  assert.ok(sq.footprint[0][0] < mg.footprint[0][0], 'Staff Quarters should be west of Main Ground');
  assert.ok(sq.footprint[0][1] > c3.footprint[0][1], 'Staff Quarters should be south of C3');

  // Spurious buildings (cultural venue, auditorium) must not exist near C3
  assert.equal(campus.places.find((p) => p.id === 'cultural-venue'), undefined, 'Cultural Venue must be removed');
  assert.equal(campus.places.find((p) => p.id === 'auditorium'), undefined, 'Auditorium must be removed');
});

test('Google Maps Region 1 route: Gate 2 to Main Ground and C2', async () => {
  // Gate 2 (entry from Highway) to C2 Institute of Engineering
  const toC2 = await engine.request({ op: 'route', from: 'gate-2', to: 'c2-engineering' });
  assert.ok(toC2.found, 'Route from Gate 2 to C2 must be found');
  assert.ok(toC2.distance > 200 && toC2.distance < 350, `Distance to C2 was ${toC2.distance} m`);
  assert.ok(toC2.steps.length >= 3, 'Must have realistic step-by-step instructions');

  // Gate 2 to Main Ground
  const toMg = await engine.request({ op: 'route', from: 'gate-2', to: 'cricket-ground' });
  assert.ok(toMg.found, 'Route from Gate 2 to Main Ground must be found');
  assert.ok(toMg.distance > 150 && toMg.distance < 380, `Distance to Main Ground was ${toMg.distance} m`);

  // Path symmetry: d(A, B) == d(B, A) on undirected pedestrian graph
  const rev = await engine.request({ op: 'route', from: 'c2-engineering', to: 'gate-2' });
  assert.ok(Math.abs(toC2.distance - rev.distance) < 1e-3, 'Route distance must be symmetric');
});

test('Google Maps Region 2 route: Main Ground West to Hostels & Academic corridors', async () => {
  // Route from Main Ground to Hostels area (Zakir, NCT)
  const toZakir = await engine.request({ op: 'route', from: 'cricket-ground', to: 'zakir-hostel' });
  assert.ok(toZakir.found, 'Route from Main Ground to Zakir Hostel must be found');
  assert.ok(toZakir.distance > 200 && toZakir.distance < 450, `Distance was ${toZakir.distance} m`);

  // Route to B4 – Kalpana Chawla Space & Research Centre & Central spine
  const toKc = await engine.request({ op: 'route', from: 'cricket-ground', to: 'b4-engineering' });
  assert.ok(toKc.found, 'Route from Main Ground to B4 Kalpana Chawla must be found');
  assert.ok(toKc.distance > 50 && toKc.distance < 450, `Distance was ${toKc.distance} m`);
});

test('Triangle inequality holds for key reference landmarks', async () => {
  // d(Gate 2, D6 Library) <= d(Gate 2, B4 Kalpana Chawla) + d(B4, D6 Library)
  const d_ac = (await engine.request({ op: 'route', from: 'gate-2', to: 'd6-library' })).distance;
  const d_ab = (await engine.request({ op: 'route', from: 'gate-2', to: 'b4-engineering' })).distance;
  const d_bc = (await engine.request({ op: 'route', from: 'b4-engineering', to: 'd6-library' })).distance;

  assert.ok(d_ac <= d_ab + d_bc + 1e-4, `Triangle inequality failed: ${d_ac} > ${d_ab} + ${d_bc}`);
});

test('Dijkstra visualizer trace captures algorithm execution accurately', async () => {
  const r = await engine.request({
    op: 'route',
    from: 'gate-2',
    to: 'c2-engineering',
    visualize: true
  });

  assert.ok(r.found, 'Route found');
  assert.ok(r.trace && r.trace.length > 5, 'Trace must have event steps');

  // Verify event types
  const types = new Set(r.trace.map((t) => t.type));
  assert.ok(types.has('init'), 'Trace must have init event');
  assert.ok(types.has('settle'), 'Trace must have settle event');
  assert.ok(types.has('relax'), 'Trace must have relax event');
  assert.ok(types.has('reach_goal'), 'Trace must have reach_goal event');
  assert.ok(types.has('done'), 'Trace must have done event');

  // Verify monotonic progression
  const settles = r.trace.filter((t) => t.type === 'settle');
  for (let i = 1; i < settles.length; i++) {
    assert.ok(
      settles[i].currentDist >= settles[i - 1].currentDist - 1e-9,
      `Dijkstra settled distances must be non-decreasing: step ${i} was ${settles[i].currentDist} vs prev ${settles[i - 1].currentDist}`
    );
  }
});
