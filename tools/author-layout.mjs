// Generates data/source/campus.estimated.source.json
//
// Layout reconstructed directly from the official Chandigarh University Mohali Campus Guide Map
// ("Know Where You Are") and cu_map_manifest.json.
// Coordinate frame:
//   Aspect ratio strictly preserved from official 2048 x 1448 map (1.41436:1).
//   Scale: S = 1000 / 2048 ≈ 0.48828 m/px.
//   x = (x_px - 1024) * S  (positive = East / right)
//   z = (y_px - 724) * S   (positive = South / bottom, negative = North / top)
// Names carry verified tags where corroborated by the official map and CU publications.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rect, ellipse, round } from './geo.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'data', 'source', 'campus.estimated.source.json');

const places = [];
const roads = [];
const ways = [];
const areas = [];

const SRC = {
  map: 'src-official-map',
  blog: 'src-cu-blog',
  hostel: 'src-cu-hostel',
  gates: 'src-collegesearch',
  fac: 'src-getmyuni',
  tour: 'src-iviewd',
};

function place(p) {
  places.push({
    aliases: [],
    levels: 2,
    geometrySource: 'estimated',
    nameSource: 'official',
    nameConfidence: 'verified',
    sources: [SRC.map],
    render: 'box',
    ...p,
    height: p.height ?? (p.levels ?? 2) * 3.6,
  });
}
const rc = (id, name, cx, cz, w, d, o = {}) => place({ id, name, footprint: rect(cx, cz, w, d, o.rot || 0), ...o });

// ---------------------------------------------------------------- gates
const gate = (id, name, x, z, aliases = [], ent = { x, z }) => place({
  id, name, aliases, kind: 'gate', render: 'gate', footprint: rect(x, z, 30, 5), height: 9, levels: 1,
  entrance: ent, nameSource: 'official', nameConfidence: 'verified', sources: [SRC.map, SRC.gates],
  note: 'Official campus entry gate.',
});

// Official Gates from CU Map & Hand-drawn Layout
gate('gate-1', 'Gate 1 (Main Gate)', 448, -282, ['main gate', 'gate 1', 'gate one', 'roundabout']);
gate('gate-2', 'Gate 2', 275, -284, ['gate two', 'gate 2'], { x: 275, z: -276 });
gate('gate-3', 'Gate 3', -51, -284, ['gate three', 'gate 3'], { x: -51, z: -284 });
gate('vip-gate', 'VIP Gate', 435, -280, ['vip gate', 'vip']);
// Gate 7 junction connecting D-Sector, Sports Complex (Gate 8), B4, and Gate 4
gate('gate-7', 'Gate 7', -15, -90, ['gate seven', 'gate 7'], { x: -15, z: -90 });
// Gate 4 on southeastern road near Main Ground
gate('gate-4', 'Gate 4', 212, 65, ['gate four', 'gate 4', 'boys hostel gate', 'boys hostel gate 4']);
// Gate 8 at Sports Complex
gate('gate-8', 'Gate 8 (Sports Complex Gate)', -268, -68, ['gate eight', 'gate 8', 'sports gate']);

// ---------------------------------------------------------------- core landmarks & fountain
place({
  id: 'fountain-plaza',
  name: 'Fountain Plaza (Musical Programme)',
  aliases: ['fountain', 'fountain area', 'central plaza', 'musical fountain', 'fountain park', 'musical programme'],
  kind: 'landmark',
  render: 'fountain',
  footprint: ellipse(322, -145, 14, 14, 20),
  height: 3,
  levels: 1,
  entrance: { x: 322, z: -145 },
  nameSource: 'official',
  nameConfidence: 'verified',
  sources: [SRC.map, SRC.blog],
  note: 'Fountain Musical Programme and central gathering plaza on official map.',
});

// ---------------------------------------------------------------- Academic Blocks A (North-East)
place({
  id: 'a1-biotech',
  name: 'A1 University Institute of Biotechnology',
  footprint: [[340, -266], [415, -268], [420, -250], [340, -248]],
  kind: 'academic',
  aliases: ['a1', 'biotechnology', 'biosciences', 'block a1'],
  levels: 5,
  height: 18,
  entranceSide: 'S',
  note: 'Dept of Biosciences, Dept of Biotechnology (A1 on official map).'
});
rc('a2-architecture', 'A2 University Institute of Architecture', 478, -180, 35, 30, {
  kind: 'academic',
  aliases: ['a2', 'architecture', 'film & visual arts', 'vfx', 'media studies', 'block a2'],
  levels: 5,
  entranceSide: 'W',
  note: 'Dept of Architecture, Film & Visual Arts, Media Studies (A2 on official map).'
});
rc('a3-liberal-arts', 'A3 Institute of Liberal Arts & Humanities', 470, -122, 44, 46, {
  kind: 'academic',
  aliases: ['a3', 'liberal arts', 'humanities', 'design', 'teacher training', 'education', 'block a3'],
  levels: 5,
  entranceSide: 'W',
  note: 'Liberal Arts, Humanities, Design, Education (A3 on official map).'
});

// ---------------------------------------------------------------- Academic Blocks B (East / Central-East)
place({
  id: 'b1-engineering',
  name: 'B1 Institute of Engineering (Nakoda CSE)',
  footprint: [
    [152, -180], [228, -180], [228, -165], [185, -165], [185, -135], [152, -135]
  ],
  kind: 'academic',
  aliases: ['b1', 'nakoda', 'cse nakoda', 'mechanical engineering', 'block b1'],
  levels: 6,
  height: 21.6,
  entranceSide: 'S',
  note: 'Computer Science & Engineering (Nakoda), ME (B1 on official map).'
});
rc('b2-hospitality', 'B2 Institute of Tourism & Hospitality Management', 236, -107, 48, 14, {
  kind: 'academic',
  aliases: ['b2', 'hospitality', 'tourism', 'airlines', 'block b2'],
  levels: 6,
  entranceSide: 'N',
  note: 'Dept of Hospitality, Tourism, Airlines (B2 on official map).'
});
// B3 – DSW: The physical DSW building at (236, -90) officially incorporating B3 identity.
rc('b3-engineering', 'B3 – DSW Building', 236, -90, 48, 14, {
  kind: 'academic',
  aliases: ['b3', 'dsw', 'b3-dsw', 'student welfare', 'department of student welfare', 'vikramshila', 'cse vikramshila', 'block b3', 'b3 - dsw'],
  levels: 5,
  entranceSide: 'S',
  note: 'B3 – DSW Building. Original DSW physical building at (236, -90), parallel wing south of B2, officially serving both B3 and DSW identities.'
});
// B4 = Kalpana Chawla Space & Research Centre. Single enlarged building at B4 location.
rc('b4-engineering', 'B4 – Kalpana Chawla Space & Research Centre', 182, -101, 24, 24, {
  kind: 'academic',
  aliases: ['b4', 'aerospace', 'automobile', 'biotech engineering', 'chemical', 'civil', 'ece', 'mechanical', 'mechatronics', 'block b4', 'kalpana chawla', 'kc block', 'kccrsst', 'space science', 'kalpana-chawla-block'],
  levels: 6,
  entrance: { x: 182, z: -89 },
  entranceSide: 'S',
  note: 'B4 = Kalpana Chawla Space & Research Centre. Aerospace, Automobile, Civil, ECE, Mechanical, Mechatronics. Single enlarged building (B4 on official map).'
});
place({
  id: 'law-block',
  name: 'B5 University Institute of Legal Studies (Law & DACA)',
  aliases: ['b5', 'b5-law', 'law-block', 'moot court', 'law', 'legal studies', 'daca', 'art and cultural affairs', 'block b5'],
  kind: 'academic',
  render: 'box',
  footprint: [[27, -114], [47, -114], [47, -122], [73, -122], [73, -98], [27, -98]],
  levels: 5,
  height: 18,
  entrance: { x: 50, z: -98 },
  entranceSide: 'S',
  nameSource: 'official',
  nameConfidence: 'verified',
  sources: [SRC.map],
  note: 'Dept of Legal Studies, Dept of Art and Cultural Affairs (B5 on official map).'
});
rc('lc-girls-hostel', 'LC Girls Hostel', 105, -116, 36, 30, {
  kind: 'hostel',
  aliases: ['lc hostel', 'lc girls hostel', 'kalpana chawla hostel', 'l-c girls hostel'],
  levels: 6,
  entrance: { x: 105, z: -101 },
  entranceSide: 'S',
  note: 'LC Girls Hostel on official map.'
});
rc('girls-hostel-1', 'Sukhna Girls Hostel', 355, -200, 36, 24, {
  kind: 'hostel',
  aliases: ['sukhna girls hostel', 'sukhna hostel', 'girls hostel 1'],
  levels: 6,
  entranceSide: 'S',
  note: 'Sukhna Girls Hostel south of A1 on official map.'
});

// ---------------------------------------------------------------- Main Ground & Academic Blocks C (South-East)
place({
  id: 'cricket-ground',
  name: 'Main Ground (Cricket & Athletic Field)',
  kind: 'sports',
  render: 'cricket',
  aliases: ['cricket', 'cricket field', 'main ground', 'ground'],
  footprint: rect(247, -3, 50, 70),
  height: 0.1,
  levels: 0,
  entranceCount: 2,
  note: 'Main sports ground on official map.'
});
place({
  id: 'basketball-court',
  name: 'Basketball Court (B3 Sports Area)',
  kind: 'sports',
  render: 'court',
  courtType: 'basketball',
  aliases: ['basketball', 'basketball court', 'handball court'],
  footprint: rect(245, -58, 30, 16),
  height: 0.1,
  levels: 0,
  entranceSide: 'W',
  note: 'Handball & Basketball Court on official map.'
});

rc('c1-engineering', 'C1 Institute of Engineering (Foundation CSE)', 308, -30, 24, 28, {
  kind: 'academic',
  aliases: ['c1', 'foundation 1', 'foundation 2', 'cse ait', 'block c1'],
  levels: 6,
  entranceSide: 'W',
  note: 'Engineering Foundation 1, 2, 4, 5 (C1 on official map).'
});
// Food Republic: located directly between C1 and C2 on the east side of Main Ground
rc('food-republic', 'Food Republic', 308, -1, 24, 18, {
  kind: 'food',
  aliases: ['fr', 'food court', 'canteen', 'mess', 'food republic'],
  levels: 2,
  height: 7,
  entranceSide: 'W',
  render: 'foodcourt',
  note: 'Food Republic food court on official map, located between C1 and C2.'
});
// C2: located below Food Republic on the right (east) side of Main Ground
rc('c2-engineering', 'C2 Institute of Engineering (Takshila CSE)', 308, 28, 24, 28, {
  kind: 'academic',
  aliases: ['c2', 'takshila', 'cse takshila', 'block c2'],
  levels: 6,
  entranceSide: 'W',
  note: 'Computer Science & Engineering (Takshila) (C2 on official map, below Food Republic on right of Main Ground).'
});
rc('c3-engineering', 'C3 Institute of Engineering (Non-CSE)', 192, -17, 20, 38, {
  kind: 'academic',
  aliases: ['c3', 'foundation 3', 'non cse', 'block c3'],
  levels: 5,
  entranceSide: 'E',
  note: 'Engineering Foundation 3 (Non-CSE) (C3 on official map).'
});
// Staff Quarters: south of C3 towards the Boys' Hostel / Gate 4 side
rc('staff-quarters', 'Staff Quarters', 196, 20, 18, 18, {
  kind: 'residential',
  aliases: ['staff quarters', 'staff quarter', 'staff residential', 'staff housing'],
  levels: 4,
  entranceSide: 'E',
  note: 'Staff Quarters on official map, south of C3 towards the Boys Hostel and Gate 4 side.'
});

rc('tagore-hostel', 'Tagore Hostel', 315, 68, 40, 24, {
  kind: 'hostel',
  aliases: ['tagore hostel', 'tagore'],
  levels: 6,
  entranceSide: 'W',
  note: 'Tagore Hostel south of Main Ground on official map.'
});
rc('info-centre-east', 'Information Centre (East)', 350, -60, 20, 16, {
  kind: 'landmark',
  aliases: ['information centre east', 'info centre east', 'help desk east'],
  levels: 1,
  entranceSide: 'W',
  note: 'Information Centre East on official map.'
});

// ---------------------------------------------------------------- Central Corridor & Spine
// Kalpana Chawla is now merged into B4. No standalone block.
// (kalpana-chawla-block removed — it IS b4-engineering)
// ---------------------------------------------------------------- D Sector (Reconstructed from Hand-Drawn Map)
place({
  id: 'orientation-venue',
  name: 'Campus Venue Block',
  aliases: ['venue east', 'academic venue'],
  kind: 'academic',
  render: 'box',
  footprint: rect(0, -245, 54, 40),
  levels: 3,
  height: 11,
  entrance: { x: -27, z: -245 },
  entranceSide: 'W',
  nameSource: 'official',
  nameConfidence: 'verified',
  sources: [SRC.map],
  note: 'Large academic facility east of Gate 3.'
});

rc('d8-pharma', 'D8 Institute of Pharma Sciences & Nursing', -95, -250, 60, 16, {
  kind: 'academic',
  aliases: ['d8', 'pharma', 'nursing', 'finance', 'global finance', 'block d8'],
  levels: 5,
  entrance: { x: -95, z: -242 },
  entranceSide: 'S',
  note: 'Pharma Sciences, Global Finance, Nursing (D8 on official map).'
});

rc('innovation-lab', 'TB1 (Technology Business Incubator)', -95, -266, 26, 10, {
  kind: 'academic',
  aliases: ['tb1', 'tbi', 'innovation lab', 'incubation', 'startup'],
  levels: 3,
  entrance: { x: -108, z: -266 },
  entranceSide: 'W',
  note: 'TB1 near Gobind Hostel on official map.'
});

rc('girls-hostel-3', 'Gobind Hostel', -95, -281, 36, 14, {
  kind: 'hostel',
  aliases: ['gobind hostel', 'gobind', 'girls hostel 3'],
  levels: 6,
  entrance: { x: -113, z: -281 },
  entranceSide: 'W',
  note: 'Gobind Hostel on official map.'
});

place({
  id: 'north-square-facility',
  name: 'North Facility Block',
  aliases: ['facility north'],
  kind: 'service',
  render: 'box',
  footprint: rect(-155, -301, 18, 18),
  levels: 2,
  height: 7,
  entrance: { x: -146, z: -300 },
  nameSource: 'official',
  nameConfidence: 'verified',
  sources: [SRC.map],
  note: 'Facility block northwest of Gobind Hostel.'
});

rc('d7-allied-health', 'D7 Institute of Allied Health Sciences', -148, -202, 18, 20, {
  kind: 'academic',
  aliases: ['d7', 'allied health', 'nutrition', 'optometry', 'forensic', 'chemistry', 'pharma research', 'block d7'],
  levels: 5,
  entrance: { x: -148, z: -192 },
  entranceSide: 'S',
  note: 'Allied Health Sciences, Nutrition, Medical Lab, Forensic, Chemistry (D7 on official map).'
});

// D6 = Central Library. Single building with dual identity.
rc('d6-library', 'D6 – Central Library (Knowledge Resource Centre)', -152, -178, 20, 18, {
  kind: 'library',
  aliases: ['lib', 'library', 'krc', 'd6', 'knowledge resource centre', 'library d6', 'central library', 'central-library', 'reading hall'],
  levels: 5,
  entrance: { x: -142, z: -178 },
  entranceSide: 'E',
  note: 'D6 = Central Library / Knowledge Resource Centre. Single building (D6 on official map marked with star).'
});

// central-library removed — D6 IS the Central Library
// swimming-pool removed — not verified on official CU map at this location

place({
  id: 'girls-hostel-2',
  name: 'Shivalik Hostel',
  aliases: ['shivalik hostel', 'shivalik', 'girls hostel 2'],
  kind: 'hostel',
  render: 'box',
  footprint: [[-199, -181], [-171, -181], [-171, -155], [-186, -155], [-186, -166], [-199, -166]],
  levels: 6,
  height: 21,
  entrance: { x: -171, z: -168 },
  entranceSide: 'E',
  nameSource: 'official',
  nameConfidence: 'verified',
  sources: [SRC.map, SRC.hostel],
  note: 'Shivalik Hostel on official map.'
});

place({
  id: 'west-utility-tower',
  name: 'West Utility Tower',
  aliases: ['tower', 'utility tower', 'chimney'],
  kind: 'service',
  render: 'box',
  footprint: rect(-232, -160, 4, 36),
  levels: 1,
  height: 15,
  entrance: { x: -230, z: -160 },
  nameSource: 'official',
  nameConfidence: 'verified',
  sources: [SRC.map],
  note: 'Utility structure west of Shivalik Hostel.'
});

rc('d1-apex-management', 'D1 Apex Institute of Management (MBA AIM)', -72, -204, 40, 12, {
  kind: 'academic',
  aliases: ['d1', 'aim mba', 'management', 'block d1', 'd1 north'],
  levels: 5,
  entrance: { x: -72, z: -198 },
  entranceSide: 'S',
  note: 'Apex Institute of Management MBA AIM (D1 North on official map).'
});

rc('d1-west', 'D1 West Wing', -112, -190, 14, 24, {
  kind: 'academic',
  aliases: ['d1 west', 'block d1 west'],
  levels: 5,
  entrance: { x: -105, z: -190 },
  entranceSide: 'E',
  note: 'Apex Institute of Management (D1 West on official map).'
});

rc('d1-link', 'D1 Corridor Link', -98.5, -201, 13, 6, {
  kind: 'academic',
  aliases: ['d1 link', 'd1 corridor'],
  levels: 2,
  height: 5,
  note: 'Connector corridor linking D1 North and D1 West.'
});

rc('d2-engineering', 'D2 Institute of Engineering (APEX AI & ML)', -36, -192, 18, 16, {
  kind: 'academic',
  aliases: ['d2', 'apex cse', 'ai ml', 'block d2'],
  levels: 5,
  entrance: { x: -36, z: -200 },
  entranceSide: 'N',
  note: 'APEX Computer Science & Engineering (AI & ML) (D2 on official map).'
});

rc('d3-engineering', 'D3 Institute of Engineering (APEX Core CSE)', -44, -170, 22, 16, {
  kind: 'academic',
  aliases: ['d3', 'apex core', 'block d3'],
  levels: 5,
  entrance: { x: -55, z: -170 },
  entranceSide: 'W',
  note: 'APEX Computer Science & Engineering Core (D3 on official map).'
});

rc('d4-apex-management', 'D4 Apex Institute of Management (BBA APEX)', -48, -146, 24, 18, {
  kind: 'academic',
  aliases: ['d4', 'bba apex', 'mba 2nd year', 'block d4'],
  levels: 5,
  entrance: { x: -60, z: -146 },
  entranceSide: 'W',
  note: 'Apex Institute of Management BBA APEX / MBA (D4 on official map).'
});

rc('d5-business', 'D5 University School of Business (Economics)', -112, -162, 14, 22, {
  kind: 'academic',
  aliases: ['d5', 'business school', 'usb economics', 'mba 1st year', 'block d5'],
  levels: 5,
  entrance: { x: -105, z: -162 },
  entranceSide: 'E',
  note: 'University School of Business MBA / Economics (D5 on official map).'
});

// ---------------------------------------------------------------- DD Sector & Far West
place({
  id: 'dd1-sciences',
  name: 'DD1 Institute of Sciences (Mathematics)',
  aliases: ['dd1', 'mathematics', 'physical education', 'block dd1'],
  kind: 'academic',
  render: 'box',
  footprint: [[-205, -299], [-165, -299], [-165, -281], [-182, -281], [-182, -288], [-194, -288], [-194, -281], [-205, -281]],
  levels: 4,
  height: 14,
  entrance: { x: -185, z: -281 },
  entranceSide: 'S',
  nameSource: 'official',
  nameConfidence: 'verified',
  sources: [SRC.map],
  note: 'Dept of Mathematics, Institute of Physical Education (DD1 on official map).'
});

rc('dd2-sciences', 'DD2 Institute of Sciences (Physics)', -180, -262, 36, 16, {
  kind: 'academic',
  aliases: ['dd2', 'physics', 'block dd2'],
  levels: 4,
  entrance: { x: -180, z: -270 },
  entranceSide: 'N',
  note: 'Dept of Physics (DD2 on official map).'
});

rc('dd3-business', 'DD3 School of Business (Adesh Campus BBA)', -288, -217, 44, 30, {
  kind: 'academic',
  aliases: ['dd3', 'adesh campus', 'bba', 'block dd3'],
  levels: 4,
  entrance: { x: -266, z: -217 },
  entranceSide: 'E',
  note: 'Adesh Campus Dept of Business Management BBA (DD3 on official map).'
});

rc('dd4-business', 'DD4 School of Business (Commerce)', -278, -166, 40, 28, {
  kind: 'academic',
  aliases: ['dd4', 'dd5', 'commerce', 'block dd4'],
  levels: 4,
  entrance: { x: -258, z: -166 },
  entranceSide: 'E',
  note: 'University School of Business Dept of Commerce (DD4 & DD5 on official map).'
});

place({
  id: 'football-ground',
  name: 'Sports Ground & Running Track',
  kind: 'sports',
  render: 'football',
  aliases: ['football', 'football field', 'athletics', 'track', 'sports ground'],
  footprint: ellipse(-354, -166, 40, 28, 32),
  height: 0.1,
  levels: 0,
  entranceSide: 'E',
  note: 'Sports Ground athletic track on official map.'
});

place({
  id: 'sports-complex',
  name: 'Sports Complex (Indoor Stadium)',
  kind: 'sports',
  render: 'stadium',
  aliases: ['sports', 'indoor stadium', 'gym', 'sports complex', 'sports department'],
  footprint: [[-243, -54], [-167, -54], [-160, -44], [-160, -26], [-167, -16], [-243, -16], [-250, -26], [-250, -44]],
  levels: 3,
  height: 12,
  entrance: { x: -205, z: -54 },
  entranceSide: 'N',
  nameSource: 'official',
  nameConfidence: 'verified',
  sources: [SRC.map],
  note: 'Indoor sports complex and gymnasium on official map.'
});

place({
  id: 'parking-d-block',
  name: 'D-Block Parking Strip',
  aliases: ['d block parking', 'parking d block'],
  kind: 'parking',
  render: 'parking',
  footprint: rect(5, -150, 20, 90),
  height: 0.1,
  levels: 0,
  entrance: { x: -5, z: -150 },
  entranceSide: 'W',
  nameSource: 'official',
  nameConfidence: 'verified',
  sources: [SRC.map],
  note: 'Parking strip along eastern D-Block road.'
});
rc('boys-hostel-south', 'Boys Hostel Complex', 280, 145, 55, 40, {
  kind: 'hostel',
  aliases: ['boys hostel', 'boys hostel south'],
  levels: 6,
  entrance: { x: 265, z: 125 },
  entranceSide: 'N',
  note: 'Boys Hostel complex past Gate 4 on hand-drawn reference.'
});

// ---------------------------------------------------------------- Hostels Area (South)
rc('zakir-hostel', 'Zakir Hall of Residence (A, B, C, D)', 25, 108, 60, 40, {
  kind: 'hostel',
  aliases: ['zakir hostel', 'zakir a', 'zakir b', 'zakir c', 'zakir d', 'zakir residence'],
  levels: 6,
  entranceSide: 'N',
  note: 'Zakir Hostels A, B, C, D on official map.'
});
place({
  id: 'open-air-theatre',
  name: 'Open Theater',
  kind: 'landmark',
  render: 'theatre',
  aliases: ['oat', 'amphitheatre', 'open air theatre', 'open theater'],
  footprint: ellipse(150, 110, 12, 12, 24),
  height: 3,
  levels: 0,
  entranceSide: 'N',
  note: 'Open Theater in NCT courtyard on official map.'
});
rc('boys-hostel-1', 'NCT 1 & 2 Hostels', 195, 110, 32, 40, {
  kind: 'hostel',
  aliases: ['nct 1', 'nct 2', 'nct hostels', 'boys hostel 1'],
  levels: 6,
  entranceSide: 'W',
  note: 'NCT 1 & 2 student residence.'
});
rc('boys-hostel-2', 'NCT 3 & 4 Hostels', 150, 138, 40, 22, {
  kind: 'hostel',
  aliases: ['nct 3', 'nct 4', 'boys hostel 2'],
  levels: 6,
  entranceSide: 'N',
  note: 'NCT 3 & 4 student residence.'
});
rc('boys-hostel-3', 'NCT 5 & 6 Hostels', 105, 110, 32, 40, {
  kind: 'hostel',
  aliases: ['nct 5', 'nct 6', 'boys hostel 3'],
  levels: 6,
  entranceSide: 'E',
  note: 'NCT 5 & 6 student residence.'
});
rc('hostel-mess', 'Hostel Mess & Night Canteen', 78, 110, 22, 18, {
  kind: 'food',
  aliases: ['night canteen', 'mess', 'tuck shop'],
  levels: 2,
  entranceSide: 'N',
  note: 'Hostel mess facility.'
});

// ---------------------------------------------------------------- Amenities & Visitor strip
place({
  id: 'visitor-parking',
  name: 'Visitor & Student Parking (Gate 1)',
  kind: 'parking',
  render: 'parking',
  aliases: ['parking', 'car park', 'student parking', 'visitor parking'],
  footprint: rect(462, -264, 22, 16),
  height: 0.1,
  levels: 0,
  entranceSide: 'W'
});
place({
  id: 'student-parking-east',
  name: 'Student Parking (East)',
  kind: 'parking',
  render: 'parking',
  aliases: ['east parking', 'student parking east'],
  footprint: rect(490, -225, 30, 20),
  height: 0.1,
  levels: 0,
  entranceSide: 'W'
});
place({
  id: 'central-parking',
  name: 'Central Parking',
  kind: 'parking',
  render: 'parking',
  aliases: ['central parking', 'parking central'],
  footprint: rect(398, -180, 26, 50),
  height: 0.1,
  levels: 0,
  entranceSide: 'W'
});
rc('admin-block', 'Administration Block & Visitor Reception', 485, -205, 20, 14, {
  kind: 'admin',
  aliases: ['admin', 'reception', 'visitor', 'registrar', 'administration'],
  levels: 3,
  entranceSide: 'N'
});
rc('medical-centre', 'Medical Centre & Dispensary', 455, -205, 20, 14, {
  kind: 'medical',
  aliases: ['hospital', 'health centre', 'dispensary', 'clinic'],
  levels: 2,
  entranceSide: 'N'
});
rc('banks-atm', 'Banks & ATMs (SBI, HDFC)', 470, -75, 20, 14, {
  kind: 'bank',
  aliases: ['sbi', 'hdfc', 'atm', 'bank'],
  levels: 1,
  entranceSide: 'N'
});

// ---------------------------------------------------------------- roads
const road = (id, name, cls, width, points, extra = {}) => roads.push({ id, name, class: cls, width, points, sidewalks: cls !== 'highway', ...extra });

// NH-95 Frontage highway alignment
road('nh95', 'NH-95 Chandigarh–Ludhiana Highway', 'highway', 24, [
  [-520, -350], [-260, -345], [-130, -332], [-51, -284], [50, -272], [140, -295], [275, -290], [448, -282], [520, -280]
], { note: 'Frontage highway alignment.' });

// Gate 2 Corridor (runs south on west side of A1 down to B2 south junction)
road('gate2-corridor', 'Gate 2 Corridor', 'avenue', 10, [[275, -290], [275, -220], [275, -145], [275, -125], [275, -74]]);

// A1 approach curve from Gate 2 road to south of A1
road('gate2-a1-curve', 'A1 Approach Curve', 'lane', 8, [[275, -220], [285, -226], [305, -234], [330, -236]]);

// A1 south road (connects approach curve to Roundabout)
road('a1-south', 'A1 South Road', 'lane', 8, [[330, -236], [435, -236]]);

// A1 full perimeter loop (west, north, east)
road('a1-west', 'A1 West Link', 'lane', 7, [[330, -236], [330, -278]]);
road('a1-north', 'A1 North Road', 'lane', 7, [[330, -278], [425, -278]]);
road('a1-east', 'A1 East Link', 'lane', 7, [[425, -278], [435, -236]]);

// Gate 1 access from Highway to Roundabout
road('gate1-link', 'Gate 1 Access', 'lane', 9, [[448, -282], [435, -236]]);

// East Parking access from Roundabout
road('roundabout-east', 'East Parking Access', 'lane', 8, [[435, -236], [470, -236]]);

// Sweeping curved avenue from Roundabout around A2/A3 and Central Parking to Gate 2/B2 junction
road('curved-avenue', 'East Campus Avenue', 'avenue', 10, [
  [435, -236], [430, -200], [422, -155], [412, -120], [395, -95], [360, -82], [320, -78], [275, -74]
]);

// Fountain Plaza cross links (circular roundabout at [322, -145])
road('fountain-west', 'Fountain West Access', 'lane', 8, [[275, -145], [308, -145]]);
road('fountain-east', 'Fountain East Access', 'lane', 8, [[336, -145], [375, -145]]);
road('fountain-south', 'Fountain South Access', 'lane', 8, [[322, -131], [320, -78]]);

// B1 access loop (surrounding B1)
road('b1-loop', 'B1 Access Loop', 'lane', 7, [
  [275, -190], [138, -190], [138, -125], [205, -125], [275, -125]
]);

// B4 connector road (between B4 and B2)
road('b4-road', 'B4 Access Road', 'lane', 7, [[205, -125], [205, -74]]);

// B2 south road (south of B2 parallel wings)
road('b2-south', 'B2 South Road', 'avenue', 9, [[205, -74], [275, -74], [284, -74]]);

// Gate 4 Corridor (past Basketball & Main Ground straight south to Gate 4)
road('gate4-corridor', 'Gate 4 Corridor', 'avenue', 9, [
  [275, -74], [212, -74], [212, -50], [212, -15], [212, 35], [212, 50], [212, 65]
]);

// Road east of Main Ground (between Main Ground and C1/FR/C2)
road('east-mg-road', 'C-Block Academic Way', 'lane', 8, [
  [284, -74], [284, -45], [284, -15], [284, 15], [284, 50], [284, 75]
], { sidewalks: false });

// Road south of Main Ground (connecting Gate 4 to C1/C2 road)
road('south-mg-road', 'Main Ground South Road', 'lane', 8, [
  [212, 50], [250, 50], [284, 50]
], { sidewalks: false });

// ---------------------------------------------------------------- D-Block Reconstructed Road Network
// Gate 3 Access Road (Highway to northern internal road)
road('gate3-road', 'Gate 3 Access Road', 'lane', 9, [[-51, -284], [-51, -233]]);

// North Internal Road (connecting Gobind, TB1, D8, and DD-sector)
road('d-north-road', 'North Internal Road', 'lane', 8, [
  [-51, -233], [-85, -233], [-95, -233], [-135, -233], [-135, -266], [-135, -276], [-135, -281], [-135, -310]
]);

// DD Blocks Access Road
road('dd-access', 'DD Blocks Access Road', 'lane', 7, [[-135, -276], [-155, -276]]);

// D-Block East Road (bordering D-Block cluster and Parking strip)
road('d-east-road', 'D-Block East Road', 'lane', 8, [
  [-85, -233], [-85, -222], [-50, -218], [-20, -206], [-15, -170], [-15, -130], [-15, -118]
]);

// D-Block Inner Courtyard Loop
road('d-inner-loop', 'D-Block Inner Loop', 'lane', 7, [
  [-85, -222], [-124, -222], [-132, -205], [-132, -178], [-132, -150], [-115, -130], [-70, -125], [-20, -118], [-15, -118]
]);

// Gate 7 North Approach Road (from D4 merge to Gate 7)
road('d-south-approach', 'Gate 7 North Approach Road', 'lane', 8, [[-15, -118], [-15, -90]]);

// Shivalik Hostel Loop
road('shivalik-loop', 'Shivalik Hostel Loop', 'lane', 7, [
  [-124, -222], [-148, -222], [-168, -228], [-205, -200], [-215, -168], [-195, -142], [-140, -140], [-132, -150]
]);

// Gate 7 to B4 Road (past B5 and LC Hostel to B4)
road('b5-b4-road', 'Gate 7 – B5 – LC Hostel – B4 Road', 'lane', 8, [
  [-15, -90], [50, -90], [105, -90], [155, -90], [172, -74], [205, -74]
], { sidewalks: false });

// Gate 7 to Gate 8 Road (towards Sports Complex)
road('gate8-road', 'Gate 7 – Gate 8 Road', 'lane', 8, [
  [-15, -90], [-70, -85], [-150, -78], [-205, -72], [-268, -68]
]);

// Sports Complex Access Spur
road('sports-spur', 'Sports Complex Spur', 'lane', 8, [[-205, -72], [-205, -60]]);

// Gate 7 to Gate 4 Diagonal Avenue
road('gate7-gate4-road', 'Gate 7 to Gate 4 Diagonal Avenue', 'avenue', 9, [
  [-15, -90], [35, -55], [85, -22], [140, 12], [190, 45], [212, 65]
]);

// Boys Hostel Access Road
road('boys-hostel-road', 'Boys Hostel Access Road', 'lane', 8, [[212, 65], [245, 95], [265, 120]]);

// South Hostel Avenue
road('south-hostel-road', 'South Hostel Avenue', 'ring', 10, [
  [-41, 215], [-41, 175], [25, 175], [150, 175], [228, 175], [228, 65], [212, 65]
]);

// ---------------------------------------------------------------- footpaths
let wid = 0;
const way = (name, points, kind = 'footpath', width = 4, extra = {}) => ways.push({ id: `w${++wid}`, name, kind, width, points, walkable: true, level: 0, ...extra });

// Gate wickets & crossings (sized to cross sidewalks)
way('Gate 1 Wicket', [[438, -282], [458, -282]], 'crossing', 4);
way('Gate 2 Wicket', [[265, -276], [285, -276]], 'crossing', 4);
way('Gate 3 Wicket', [[-68, -284], [-34, -284]], 'crossing', 4);
way('Gate 7 Wicket', [[-32, -90], [5, -90]], 'crossing', 4);
way('Gate 4 Wicket', [[195, 65], [230, 65]], 'crossing', 4);
way('Gate 8 Wicket', [[-280, -68], [-245, -68]], 'crossing', 4);
way('VIP Gate Wicket', [[425, -280], [445, -280]], 'crossing', 4);

// Rings & Plazas
const circ = (cx, cz, r, n) => Array.from({ length: n + 1 }, (_, i) => { const a = (i % n) / n * Math.PI * 2; return [round(cx + Math.cos(a) * r), round(cz + Math.sin(a) * r)]; });
way('Roundabout Ring', circ(435, -236, 12, 16), 'plaza', 4);
way('Junction Crossing 275-74', [[265, -74], [295, -74]], 'crossing', 4);
way('Gate 2 Junction Crossing', [[275, -83], [275, -65]], 'crossing', 4);
way('East MG North Crossing', [[275, -67], [295, -67]], 'crossing', 4);
way('Fountain Plaza Ring', circ(322, -145, 14, 16), 'plaza', 4);
way('NCT Courtyard Ring', circ(150, 110, 14, 16), 'plaza', 4);

// Gate connectors & Road Junction Hub Crossings
way('Gate 1 Connector', [[448, -282], [442, -265]], 'footpath', 3);
way('Gate 2 Connector', [[275, -284], [275, -270]], 'footpath', 3);
way('Gate 3 Connector', [[-51, -284], [-51, -233]], 'footpath', 3);
way('Gate 3 Hub Crossing NS', [[-51, -248], [-51, -218]], 'crossing', 4);
way('Gate 3 Hub Crossing EW', [[-68, -233], [-34, -233]], 'crossing', 4);
way('Gate 7 Connector', [[-15, -90], [-15, -118]], 'footpath', 3);
way('Gate 7 Hub Crossing NS', [[-15, -105], [-15, -75]], 'crossing', 4);
way('Gate 7 Hub Crossing EW', [[-32, -90], [5, -90]], 'crossing', 4);
way('Gate 7 Diagonal Crossing', [[-25, -98], [0, -80]], 'crossing', 4);
way('Gate 4 Connector', [[212, 65], [212, 50]], 'footpath', 4);
way('Gate 4 Hub Crossing NS', [[212, 50], [212, 78]], 'crossing', 4);
way('Gate 4 Hub Crossing EW', [[195, 65], [230, 65]], 'crossing', 4);
way('Gate 8 Connector', [[-268, -68], [-230, -68]], 'footpath', 3);
way('Gate 8 Hub Crossing EW', [[-280, -68], [-245, -68]], 'crossing', 4);
way('Gate 8 Hub Crossing NS', [[-268, -82], [-268, -55]], 'crossing', 4);
way('VIP Gate Connector', [[435, -280], [435, -248]], 'footpath', 3);

// D-Sector Junction Hub Crossings
way('D-North/East Hub Crossing NS', [[-85, -241], [-85, -218]], 'crossing', 4);
way('D-North/East Hub Crossing EW', [[-102, -233], [-68, -233]], 'crossing', 4);
way('D-East/Inner Loop Crossing EW', [[-102, -222], [-68, -222]], 'crossing', 4);
way('D-East D4-Merge Approach', [[-15, -132], [-15, -105]], 'crossing', 4);
way('D-East D4-Merge EW Crossing', [[-32, -118], [2, -118]], 'crossing', 4);
way('DD Access Junction Crossing NS', [[-135, -290], [-135, -260]], 'crossing', 4);
way('DD Access Junction Crossing EW', [[-160, -276], [-120, -276]], 'crossing', 4);
way('Sports Spur Crossing NS', [[-205, -84], [-205, -48]], 'crossing', 4);
way('Sports Spur Crossing EW', [[-218, -72], [-192, -72]], 'crossing', 4);

// B4 / B2 / Gate 4 North Intersections
way('B4 Junction Crossing EW', [[180, -74], [220, -74]], 'crossing', 4);
way('B4 Junction Crossing NS', [[205, -90], [205, -60]], 'crossing', 4);
way('Gate 4 North Junction NS', [[212, -90], [212, -60]], 'crossing', 4);
way('Gate 4 North Junction EW', [[198, -74], [226, -74]], 'crossing', 4);
way('Boys Hostel South Crossing', [[245, 120], [275, 120]], 'crossing', 4);

// Central & Visitor spurs
way('ATM Spur', [[395, -95], [460, -75]], 'footpath', 3);
way('Admin Spur', [[435, -236], [470, -236], [470, -212]], 'footpath', 3);

// C-Block pedestrian accesses & registered traversable road ways
way('C-Block Academic Way', [
  [284, -74], [284, -67], [284, -45], [284, -30], [284, -15], [284, -1], [284, 15], [284, 28], [284, 50], [284, 68], [284, 75]
], 'footpath', 4);
way('Main Ground South Road', [
  [284, 50], [250, 50], [212, 50]
], 'footpath', 4);
way('C1 Spur', [[284, -30], [296, -30]], 'footpath', 3);
way('FR Spur', [[284, -1], [296, -1]], 'footpath', 3);
way('C2 Spur', [[284, 28], [296, 28]], 'footpath', 3);
way('Tagore Spur', [[284, 68], [295, 68]], 'footpath', 3);
way('C3 Spur', [[212, -17], [202, -17]], 'footpath', 3);
way('Staff Spur', [[212, 20], [205, 20]], 'footpath', 3);

// D-sector verified entrance walkways
way('DD1 Access Walk', [[-185, -281], [-185, -276], [-135, -276]], 'footpath', 3);
way('DD2 Access Walk', [[-180, -270], [-180, -276], [-135, -276]], 'footpath', 3);
way('DD Campus Walk', [[-268, -68], [-255, -68], [-255, -166], [-255, -217]], 'footpath', 3.5);
way('DD Campus Walk Link', [[-255, -217], [-255, -276], [-185, -276]], 'footpath', 3.5);
way('Sports Ground Walk', [[-255, -145], [-325, -145], [-325, -166]], 'footpath', 3.5);
way('North Facility Walk', [[-146, -300], [-135, -300]], 'footpath', 3);
way('Gobind Hostel Walk', [[-113, -281], [-135, -281]], 'footpath', 3);
way('TB1 Access Walk', [[-108, -266], [-135, -266]], 'footpath', 3);
way('D8 North Walk', [[-95, -242], [-95, -233]], 'footpath', 3);
way('Orientation Venue Walk', [[-27, -245], [-51, -245]], 'footpath', 3);
way('D1 North Courtyard Walk', [[-70, -198], [-70, -175], [-75, -175], [-75, -135], [-70, -125], [-70, -112]], 'footpath', 3);
way('D1 West Courtyard Walk', [[-105, -190], [-85, -190], [-75, -175]], 'footpath', 3);
way('D2 North Walk', [[-36, -200], [-36, -215], [-50, -218], [-50, -210]], 'footpath', 3);
way('D3 Courtyard Walk', [[-55, -170], [-75, -170]], 'footpath', 3);
way('D4 Courtyard Walk', [[-60, -146], [-75, -146]], 'footpath', 3);
way('D5 Courtyard Walk', [[-105, -162], [-85, -162], [-75, -135]], 'footpath', 3);
way('D7 Loop Walk', [[-148, -192], [-132, -192], [-132, -178]], 'footpath', 3);
way('D6 Library Loop Walk', [[-142, -178], [-125, -178]], 'footpath', 3);
way('Shivalik Loop Walk', [[-171, -168], [-165, -168], [-165, -160], [-132, -160]], 'footpath', 3);
way('Tower Walk', [[-230, -160], [-210, -160]], 'footpath', 3);
way('Gate 7 – B5 – LC Hostel – B4 Road', [
  [-15, -90], [50, -90], [105, -90], [155, -90], [172, -74], [182, -74], [205, -74]
], 'footpath', 4);
way('B5 Legal Studies Walk', [[50, -98], [50, -90]], 'footpath', 3);
way('LC Girls Hostel Walk', [[105, -101], [105, -90]], 'footpath', 3);
// Kalpana Chawla Walk removed — standalone building merged into B4
way('B4 Access Spur', [[182, -89], [182, -74]], 'footpath', 3);
way('Sports Complex Walk', [[-205, -54], [-205, -72]], 'footpath', 3);
// Swimming Pool Walk removed — swimming-pool building removed (not on official map)
// Central Library Walk removed — central-library building removed (D6 IS Central Library)
way('Boys Hostel South Walk', [[265, 125], [265, 115]], 'footpath', 3);

// Hostel pedestrian links
way('Zakir Access Walk', [[-15, 80], [25, 80]], 'footpath', 3.5);
way('Zakir South Link', [[-15, 80], [-15, 175]], 'footpath', 3.5);
way('NCT South Link', [[136, 110], [125, 110], [125, 175]], 'footpath', 3.5);
way('Hostel Mess Walk', [[78, 101], [78, 80], [25, 80]], 'footpath', 3);
way('Hostel Underbridge Walk', [[212, 50], [25, 50], [25, 80], [-15, 80]], 'footpath', 3.5);
way('Southeast Perimeter Walk', [[275, 75], [284, 75], [284, 88], [330, 88], [330, 155]], 'footpath', 3.5);

// ---------------------------------------------------------------- areas
const area = (id, type, polygon, name) => areas.push({ id, type, polygon, name });
area('fountain-plaza-paving', 'plaza', ellipse(322, -145, 16, 16, 24), 'Fountain Plaza');
area('lawn-a1-west', 'lawn', rect(305, -260, 36, 30), 'West A1 Lawn');
area('lawn-fountain-se', 'lawn', rect(350, -115, 30, 25), 'Fountain Southeast Lawn');
area('lawn-main-ground', 'sports', rect(247, -3, 50, 70), 'Main Ground Field');
area('lawn-sports-west', 'sports', ellipse(-354, -166, 40, 28, 32), 'West Athletic Field');
area('lawn-hostels-s', 'lawn', rect(150, 110, 80, 40), 'Hostel Green Courtyard');
area('lawn-gobind-d8', 'lawn', [[-122, -295], [-68, -295], [-68, -238], [-122, -238]], 'Gobind D8 Lawn');
area('lawn-acad-d', 'lawn', [[-195, -135], [-130, -135], [-130, -85], [-195, -85]], 'D-Block Lawn Belt');
area('lawn-b5-diagonal', 'lawn', [[0, -84], [115, -84], [105, -35], [-5, -65]], 'South B5 Lawn');
area('lawn-north-belt', 'lawn', rect(100, -255, 150, 20), 'North Green Belt');

const source = {
  schema: 'cu-campus-source/1',
  meta: {
    name: 'Chandigarh University, Mohali (Gharuan) - Official Campus Map Layout',
    status: 'ESTIMATED',
    description: 'Reconstructed layout based on official Chandigarh University Campus Guide Map ("Know Where You Are"), cu_map_manifest.json and official publications.',
    generator: 'tools/author-layout.mjs',
    sources: [
      { id: SRC.map, title: 'Chandigarh University Official Campus Map (Know Where You Are)', url: 'CU_map.png', used: 'Official Academic Blocks (A1-A3, B1-B5, C1-C3 with C2 below C1 on right side of Main Ground, D1-D8, DD1-DD4), Hostels, Gates (1, 2, 3, 8/4, VIP), Main Ground, Sports Complex. B3=DSW, B4=Kalpana Chawla, D6=Central Library per user-verified corrections.' },
      { id: SRC.tour, title: 'CU virtual campus tour (iviewd.com/cu2) - page metadata', url: 'https://iviewd.com/cu2/', used: 'Campus reference coordinate 30.7668 N, 76.5781 E.' },
      { id: SRC.blog, title: 'CU blog: Top places at Chandigarh University', url: 'https://blog.cuchd.in/2026/06/top-places-chandigarh-university.html', used: 'Kalpana Chawla Block, Food Republic, D6 Library, Knowledge Resource Centre, Central Library, Fountain Area, Sports Complex.' },
      { id: SRC.hostel, title: 'CU hostel facility page', url: 'https://www.cuchd.in/student-services/hostel-facility.php', used: 'Existence of separate Boys and Girls hostels.' },
      { id: SRC.gates, title: 'CollegeSearch - Chandigarh University location', url: 'https://www.collegesearch.in/articles/chandigarh-university-location-uni', used: 'Gate 1, Gate 2, Gate 4 and Main Gate.' },
      { id: SRC.fac, title: 'GetMyUni - Chandigarh University facilities', url: 'https://www.getmyuni.com/college/chandigarh-university-mohali-facilities', used: 'Facility inventory: auditorium, open theater, medical centre, banks, sports venues.' },
    ],
  },
  origin: { lat: 30.7668, lon: 76.5781 },
  boundary: [[-520, -350], [520, -350], [520, 250], [-520, 250]],
  places,
  roads,
  ways,
  areas,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(source, null, 1));
console.log(`wrote ${path.relative(process.cwd(), out)}: ${places.length} places, ${roads.length} roads, ${ways.length} ways, ${areas.length} areas`);
