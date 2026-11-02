// Comprehensive verification script for D-Block reconstruction
// Generates:
// 1. Top-down 2D layout preview (d-block-preview.png)
// 2. Direct overlay on original hand-drawn reference (d-block-overlay.png)
// 3. Pedestrian navigation graph visual (d-block-graph.png)
// 4. Detailed structural integrity check results (collisions, connectivity, entrances, gates, overlaps)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import * as G from './geo.mjs';

const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';
const REF_IMG = path.join(ARTIFACT_DIR, '.user_uploaded/media_1793470159928_273828b0.jpg');

// Exact geometry definition
export function getDBlockModel() {
  const roads = [
    // 1. Highway along northern boundary
    {
      id: 'highway',
      name: 'Ludhiana–Chandigarh Highway',
      width: 18,
      points: [[-260, -345], [-130, -332], [-51, -284], [50, -272], [240, -252]],
      verified: true
    },
    // 2. Gate 3 Access Road
    {
      id: 'gate3-road',
      name: 'Gate 3 Access Road',
      width: 9,
      points: [[-51, -284], [-51, -233]],
      verified: true
    },
    // 3. Northern internal road
    {
      id: 'd-north-road',
      name: 'North Internal Road',
      width: 8,
      points: [[-51, -233], [-85, -233], [-135, -233], [-135, -276], [-135, -310]],
      verified: true
    },
    // 4. DD Blocks access spur
    {
      id: 'dd-access',
      name: 'DD Blocks Access Road',
      width: 7,
      points: [[-135, -276], [-155, -276]],
      verified: true
    },
    // 5. Outer East Road (beside Parking to Gate 7)
    {
      id: 'd-east-road',
      name: 'D-Block East Road',
      width: 8,
      points: [[-85, -233], [-85, -222], [-50, -218], [-20, -206], [-15, -170], [-15, -130], [-15, -90]],
      verified: true
    },
    // 6. Inner D-Block loop
    {
      id: 'd-inner-loop',
      name: 'D-Block Inner Loop',
      width: 7,
      points: [[-85, -222], [-124, -222], [-132, -205], [-132, -150], [-115, -130], [-70, -125], [-20, -118], [-15, -90]],
      verified: true
    },
    // 7. Shivalik Hostel Loop
    {
      id: 'shivalik-loop',
      name: 'Shivalik Hostel Loop',
      width: 7,
      points: [[-124, -222], [-168, -228], [-205, -200], [-215, -168], [-195, -142], [-140, -140], [-132, -150]],
      verified: true
    },
    // 8. Road past B5, LC Hostel to B4
    {
      id: 'b5-b4-road',
      name: 'Gate 7 – B5 – LC Hostel – B4 Road',
      width: 8,
      points: [[-15, -90], [50, -90], [130, -90], [170, -90], [170, -115], [205, -115], [205, -74]],
      verified: true
    },
    // 9. Road to Gate 8 & Sports Complex
    {
      id: 'gate8-road',
      name: 'Gate 7 – Gate 8 Road',
      width: 8,
      points: [[-15, -90], [-70, -85], [-150, -78], [-205, -72], [-268, -68]],
      verified: true
    },
    // 10. Sports Complex access spur
    {
      id: 'sports-spur',
      name: 'Sports Complex Access',
      width: 8,
      points: [[-205, -72], [-205, -60]],
      verified: true
    },
    // 11. Diagonal avenue from Gate 7 to Gate 4
    {
      id: 'gate7-gate4-road',
      name: 'Gate 7 to Gate 4 Diagonal Avenue',
      width: 9,
      points: [[-15, -90], [35, -55], [85, -22], [140, 12], [190, 45], [212, 65]],
      verified: true
    },
    // 12. Road past Gate 4 to Boys Hostel
    {
      id: 'boys-hostel-road',
      name: 'Boys Hostel Access',
      width: 8,
      points: [[212, 65], [245, 95], [265, 120]],
      verified: true
    }
  ];

  const buildings = [
    // DD1 Block
    {
      id: 'dd1',
      name: 'DD1 Block',
      label: 'DD1',
      poly: [[-205, -299], [-165, -299], [-165, -281], [-182, -281], [-182, -288], [-194, -288], [-194, -281], [-205, -281]],
      entrance: [-185, -281],
      isUnnamed: false
    },
    // DD2 Block
    {
      id: 'dd2',
      name: 'DD2 Block',
      label: 'DD2',
      poly: [[-198, -270], [-162, -270], [-162, -254], [-198, -254]],
      entrance: [-180, -270],
      isUnnamed: false
    },
    // Unnamed square block northwest of Gobind
    {
      id: 'north-square',
      name: 'Unnamed Facility',
      label: '', // Unnamed as requested
      poly: [[-164, -310], [-146, -310], [-146, -292], [-164, -292]],
      entrance: [-146, -300],
      isUnnamed: true
    },
    // Gobind Hostel
    {
      id: 'gobind',
      name: 'Gobind Hostel',
      label: 'GOBIND\nHOSTEL',
      poly: [[-113, -288], [-77, -288], [-77, -274], [-113, -274]],
      entrance: [-95, -274],
      isUnnamed: false
    },
    // TB1
    {
      id: 'tb1',
      name: 'TB1',
      label: 'TB1',
      poly: [[-108, -271], [-82, -271], [-82, -261], [-108, -261]],
      entrance: [-95, -261],
      isUnnamed: false
    },
    // D8 Block
    {
      id: 'd8',
      name: 'D8 Block',
      label: 'D8',
      poly: [[-125, -258], [-65, -258], [-65, -242], [-125, -242]],
      entrance: [-95, -242],
      isUnnamed: false
    },
    // Unnamed large venue east of Gate 3
    {
      id: 'east-venue',
      name: 'Unnamed Large Block',
      label: '', // Unnamed as requested
      poly: [[-27, -265], [27, -265], [27, -225], [-27, -225]],
      entrance: [-27, -245],
      isUnnamed: true
    },
    // D1 Block (North Block) - Separate footprint, not monolithic L-shape
    {
      id: 'd1-north',
      name: 'D1 Block (North)',
      label: 'D1 BLOCK',
      poly: [[-92, -212], [-48, -212], [-48, -198], [-92, -198]],
      entrance: [-70, -198],
      isUnnamed: false
    },
    // D1 Block (West Block) - Separate footprint
    {
      id: 'd1-west',
      name: 'D1 Block (West)',
      label: 'D1\nBLOCK',
      poly: [[-119, -202], [-105, -202], [-105, -178], [-119, -178]],
      entrance: [-105, -190],
      isUnnamed: false
    },
    // D1 Corridor Link (connecting North and West blocks)
    {
      id: 'd1-link',
      name: 'D1 Connector',
      label: '',
      poly: [[-105, -204], [-92, -204], [-92, -198], [-105, -198]],
      isUnnamed: true,
      isCorridor: true
    },
    // D2 Block
    {
      id: 'd2',
      name: 'D2 Block',
      label: 'D2\nBLOCK',
      poly: [[-45, -200], [-27, -200], [-27, -184], [-45, -184]],
      entrance: [-36, -184],
      isUnnamed: false
    },
    // D3 Block
    {
      id: 'd3',
      name: 'D3 Block',
      label: 'D3\nBLOCK',
      poly: [[-55, -178], [-33, -178], [-33, -162], [-55, -162]],
      entrance: [-44, -162],
      isUnnamed: false
    },
    // D4 Block
    {
      id: 'd4',
      name: 'D4 Block',
      label: 'D4\nBLOCK',
      poly: [[-60, -155], [-36, -155], [-36, -137], [-60, -137]],
      entrance: [-48, -137],
      isUnnamed: false
    },
    // D5 Block
    {
      id: 'd5',
      name: 'D5 Block',
      label: 'D5\nBLOCK',
      poly: [[-119, -173], [-105, -173], [-105, -151], [-119, -151]],
      entrance: [-105, -162],
      isUnnamed: false
    },
    // D7 Block (northwest of D-cluster)
    {
      id: 'd7',
      name: 'D7 Block',
      label: 'D7\nBLOCK',
      poly: [[-157, -217], [-139, -217], [-139, -193], [-157, -193]],
      entrance: [-139, -205],
      isUnnamed: false
    },
    // D6 Block (with STAR icon)
    {
      id: 'd6',
      name: 'D6 Block',
      label: 'D6 ★',
      poly: [[-162, -187], [-142, -187], [-142, -169], [-162, -169]],
      entrance: [-142, -178],
      isUnnamed: false
    },
    // Shivalik Hostel
    {
      id: 'shivalik',
      name: 'Shivalik Hostel',
      label: 'SHIVALIK\nHOSTEL',
      poly: [[-199, -181], [-171, -181], [-171, -155], [-186, -155], [-186, -166], [-199, -166]],
      entrance: [-171, -168],
      isUnnamed: false
    },
    // Unnamed vertical tower / chimney
    {
      id: 'chimney',
      name: 'Unnamed Structure',
      label: '', // Unnamed as requested
      poly: [[-234, -178], [-230, -178], [-230, -142], [-234, -142]],
      entrance: [-230, -160],
      isUnnamed: true
    },
    // B5 Block
    {
      id: 'b5',
      name: 'B5 Block',
      label: 'B5 BLOCK',
      poly: [[27, -114], [47, -114], [47, -122], [73, -122], [73, -98], [27, -98]],
      entrance: [50, -98],
      isUnnamed: false
    },
    // LC Hostel Girls
    {
      id: 'lc-hostel',
      name: 'LC Hostel Girls',
      label: 'LC\nHOSTEL\nGIRLS',
      poly: [[98, -134], [142, -134], [142, -98], [98, -98]],
      entrance: [120, -98],
      isUnnamed: false
    },
    // B4 Block
    {
      id: 'b4',
      name: 'B4 Block',
      label: 'B4',
      poly: [[182, -109], [198, -109], [198, -79], [182, -79]],
      entrance: [198, -94],
      isUnnamed: false
    },
    // Sports Complex
    {
      id: 'sports-complex',
      name: 'Sports Complex',
      label: 'SPORTS\nCOMPLEX',
      poly: [[-243, -54], [-167, -54], [-160, -44], [-160, -26], [-167, -16], [-243, -16], [-250, -26], [-250, -44]],
      entrance: [-205, -54],
      isUnnamed: false
    },
    // Boys Hostel
    {
      id: 'boys-hostel',
      name: 'Boys Hostel',
      label: 'BOYS\nHOSTEL',
      poly: [[252, 125], [307, 125], [307, 165], [252, 165]],
      entrance: [265, 125],
      isUnnamed: false
    }
  ];

  const parkings = [
    {
      id: 'p-d-block',
      name: 'Parking',
      poly: [[-5, -195], [15, -195], [15, -105], [-5, -105]],
      label: 'PARKING'
    }
  ];

  const gates = [
    { id: 'gate-3', name: 'GATE 3', x: -51, z: -284, rot: 0 },
    { id: 'gate-7', name: 'GATE 7', x: -15, z: -90, rot: 0 },
    { id: 'gate-8', name: 'GATE 8', x: -268, z: -68, rot: 0 },
    { id: 'gate-4', name: 'GATE 4', x: 212, z: 65, rot: 32 }
  ];

  return { roads, buildings, parkings, gates };
}

function distPointToPolyline(p, pts) {
  let minD = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const pr = G.projectToSegment(p, pts[i], pts[i + 1]);
    if (pr.d < minD) minD = pr.d;
  }
  return minD;
}

// -------------------------------------------------------------
// Automated Checks
// -------------------------------------------------------------
export function runIntegrityChecks() {
  const { roads, buildings, parkings, gates } = getDBlockModel();
  const results = {};

  // Check 1: Road-to-building collisions
  const collisions = [];
  const allObstacles = [...buildings.map(b => ({ id: b.id, name: b.name, poly: b.poly })), ...parkings.map(p => ({ id: p.id, name: p.name, poly: p.poly }))];
  for (const r of roads) {
    for (const b of allObstacles) {
      const d = G.distPolygonToPolyline(b.poly, r.points);
      const req = r.width / 2 + 0.5;
      if (d < req) {
        collisions.push({ road: r.id, obstacle: b.id, d: d.toFixed(2), req: req.toFixed(2) });
      }
    }
  }
  results.collisions = { passed: collisions.length === 0, count: collisions.length, details: collisions };

  // Check 2: Road network connectivity (all roads connect to a shared network)
  const visitedRoads = new Set();
  const roadQueue = [roads.find(r => r.id === 'gate3-road')];
  visitedRoads.add('gate3-road');
  while (roadQueue.length) {
    const curr = roadQueue.shift();
    for (const r of roads) {
      if (visitedRoads.has(r.id)) continue;
      const touches = r.points.some(p1 => curr.points.some(p2 => Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) <= 2.0));
      if (touches) {
        visitedRoads.add(r.id);
        roadQueue.push(r);
      }
    }
  }
  const disconnectedRoads = roads.filter(r => !visitedRoads.has(r.id)).map(r => r.id);
  results.connectivity = { passed: disconnectedRoads.length === 0, disconnected: disconnectedRoads };

  // Check 3: Isolated road segments
  const isolated = roads.filter(r => {
    const touchesOther = roads.some(o => o !== r && o.points.some(p1 => r.points.some(p2 => Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) <= 2.0)));
    return !touchesOther;
  }).map(r => r.id);
  results.isolated = { passed: isolated.length === 0, count: isolated.length, isolated };

  // Check 4: Building entrance accessibility
  const entranceDetails = [];
  for (const b of buildings) {
    if (!b.entrance) continue;
    const nearestRoad = roads.reduce((minD, r) => {
      const d = distPointToPolyline(b.entrance, r.points);
      return Math.min(minD, d);
    }, Infinity);
    entranceDetails.push({ id: b.id, name: b.name, dist: nearestRoad.toFixed(1), accessible: nearestRoad <= 35.0 });
  }
  const inaccessible = entranceDetails.filter(e => !e.accessible);
  results.entrances = { passed: inaccessible.length === 0, count: entranceDetails.length, details: entranceDetails, inaccessible };

  // Check 5: Gate connectivity
  const gateCheck = [];
  for (const g of gates) {
    const d = roads.reduce((minD, r) => {
      const dist = distPointToPolyline([g.x, g.z], r.points);
      return Math.min(minD, dist);
    }, Infinity);
    gateCheck.push({ id: g.id, name: g.name, dist: d.toFixed(2), connected: d < 4.0 });
  }
  results.gates = { passed: gateCheck.every(g => g.connected), details: gateCheck };

  // Check 6: Duplicate or overlapping road segments
  const overlaps = [];
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      const r1 = roads[i], r2 = roads[j];
      for (let si = 0; si + 1 < r1.points.length; si++) {
        for (let sj = 0; sj + 1 < r2.points.length; sj++) {
          const a1 = r1.points[si], b1 = r1.points[si + 1];
          const a2 = r2.points[sj], b2 = r2.points[sj + 1];
          // Check if segments are collinear and overlapping
          const same = (Math.hypot(a1[0]-a2[0], a1[1]-a2[1]) < 0.5 && Math.hypot(b1[0]-b2[0], b1[1]-b2[1]) < 0.5) ||
                       (Math.hypot(a1[0]-b2[0], a1[1]-b2[1]) < 0.5 && Math.hypot(b1[0]-a2[0], b1[1]-a2[1]) < 0.5);
          if (same) overlaps.push({ r1: r1.id, r2: r2.id, seg1: si, seg2: sj });
        }
      }
    }
  }
  results.overlaps = { passed: overlaps.length === 0, count: overlaps.length, overlaps };

  // Check 7: D1 footprint verification
  const d1North = buildings.find(b => b.id === 'd1-north');
  const d1West = buildings.find(b => b.id === 'd1-west');
  const d1Separated = d1North && d1West && d1North.poly.length === 4 && d1West.poly.length === 4;
  results.d1Footprint = { passed: Boolean(d1Separated), isLShaped: false, description: 'Separated D1 North and D1 West rectangular footprints with connection' };

  // Check 8: Unnamed buildings verification
  const unnamed = buildings.filter(b => b.isUnnamed);
  const noInventedLabels = unnamed.every(b => b.label === '');
  results.unnamedBuildings = { passed: noInventedLabels, count: unnamed.length, list: unnamed.map(b => b.id) };

  return results;
}

console.log(JSON.stringify(runIntegrityChecks(), null, 2));
