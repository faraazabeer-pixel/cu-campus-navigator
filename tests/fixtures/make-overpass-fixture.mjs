// Generates tests/fixtures/overpass-synthetic.json - a SYNTHETIC Overpass "out geom" response used only
// to test tools/import-osm.mjs. It is not real OpenStreetMap data and does not depict the real campus.
import fs from 'node:fs';
import { enuToLatLon, rect } from '../../tools/geo.mjs';
const origin = { lat: 30.7668, lon: 76.5781 };
const ll = ([x, z]) => { const r = enuToLatLon(origin, x, z); return { lat: +r.lat.toFixed(7), lon: +r.lon.toFixed(7) }; };
let id = 1000; const els = [];
const way = (tags, pts, closed) => els.push({ type: 'way', id: ++id, tags, geometry: [...pts, ...(closed ? [pts[0]] : [])].map(ll) });
way({ building: 'university', name: 'Test Library', amenity: 'library', 'building:levels': '4' }, rect(0, 0, 40, 25), true);
way({ building: 'dormitory', name: 'Test Boys Hostel', height: '21' }, rect(120, 0, 50, 25), true);
way({ building: 'yes', name: 'Test Admin Office' }, rect(0, 90, 30, 20), true);
way({ building: 'yes' }, rect(120, 90, 20, 20), true);                         // unnamed -> scenery
way({ leisure: 'pitch', sport: 'cricket', name: 'Test Cricket Pitch' }, rect(240, 40, 60, 50), true);
way({ amenity: 'parking', name: 'Test Parking' }, rect(-100, 40, 40, 30), true);
way({ highway: 'service', name: 'Test Lane' }, [[-60, 50], [60, 50], [180, 50], [300, 50]], false);
way({ highway: 'footway', name: 'Library Path' }, [[0, 50], [0, 20]], false);
way({ highway: 'footway', name: 'Hostel Path' }, [[120, 50], [120, 20]], false);
way({ highway: 'footway', name: 'Admin Path' }, [[0, 50], [0, 78]], false);
way({ highway: 'footway', name: 'Pitch Path' }, [[240, 50], [240, 62]], false);
way({ highway: 'steps', name: 'Test Steps' }, [[-60, 50], [-80, 50]], false);
way({ highway: 'footway', footway: 'crossing' }, [[-30, 45], [-30, 55]], false);
way({ landuse: 'grass' }, rect(60, 120, 80, 40), true);
els.push({ type: 'node', id: 1, lat: ll([-60, 50]).lat, lon: ll([-60, 50]).lon, tags: { barrier: 'gate', name: 'Test Gate 9' } });
fs.writeFileSync(new URL('./overpass-synthetic.json', import.meta.url), JSON.stringify({ version: 0.6, generator: 'synthetic test fixture', elements: els }, null, 1));
console.log('wrote', els.length, 'elements');
