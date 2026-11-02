import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { convert, overpassQuery } from '../tools/import-osm.mjs';
import { compile } from '../tools/build-campus.mjs';
import { validateCampus } from '../tools/validate-campus.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/overpass-synthetic.json', import.meta.url), 'utf8'));

test('OSM importer converts a (synthetic) Overpass response into the source schema', () => {
  const { source, stats } = convert(fixture, { origin: { lat: 30.7668, lon: 76.5781 } });
  const ids = source.places.map((p) => p.id);
  assert.ok(ids.includes('test-library') && ids.includes('test-boys-hostel') && ids.includes('test-gate-9') && ids.includes('test-cricket-pitch'));
  assert.equal(source.places.find((p) => p.id === 'test-library').kind, 'library');
  assert.equal(source.places.find((p) => p.id === 'test-boys-hostel').kind, 'hostel');
  assert.equal(source.places.find((p) => p.id === 'test-boys-hostel').height, 21);
  assert.equal(source.places.find((p) => p.id === 'test-library').height, 14.4);
  assert.equal(source.places.find((p) => p.id === 'test-cricket-pitch').render, 'cricket');
  assert.equal(source.scenery.length, 1); assert.equal(stats.unnamedScenery, 1);
  assert.ok(source.ways.some((w) => w.kind === 'stairs') && source.ways.some((w) => w.kind === 'crossing'));
  assert.ok(source.places.every((p) => p.geometrySource === 'osm' && p.nameConfidence === 'osm'));
  assert.equal(source.meta.status, 'OSM_IMPORT'); assert.match(source.meta.sources[0].title, /OpenStreetMap/);
  // round trip: positions land where we put them (library centred on origin)
  const lib = source.places.find((p) => p.id === 'test-library'); const cx = lib.footprint.reduce((s, p) => s + p[0], 0) / 4; assert.ok(Math.abs(cx) < 0.1);
});

test('imported data compiles, validates and routes end to end (non-strict geometry checks)', () => {
  const { source } = convert(fixture, { origin: { lat: 30.7668, lon: 76.5781 } });
  const rt = compile(source); const { errors } = validateCampus(rt, { strict: false });
  assert.deepEqual(errors, []);
  assert.equal(rt.meta.status, 'OSM_IMPORT'); assert.equal(rt.scenery.length, 1);
  assert.ok(rt.places.every((p) => p.entrances.length >= 1));
});

test('importer rejects empty / nameless data and builds a valid Overpass query', () => {
  assert.throws(() => convert({ elements: [] }), /no geometry/);
  assert.throws(() => convert({ elements: [{ type: 'way', id: 1, tags: { highway: 'footway' }, geometry: [{ lat: 30.7, lon: 76.5 }, { lat: 30.7001, lon: 76.5 }] }] }), /no named places/);
  assert.match(overpassQuery([30.75, 76.56, 30.78, 76.6]), /way\["building"\]\(30\.75,76\.56,30\.78,76\.6\)/);
});
