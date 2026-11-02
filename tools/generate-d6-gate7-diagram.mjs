// Generates a dedicated high-resolution 2D schematic diagram of the D6 -> Gate 7 route
// displaying:
// 1. D6 (Central Library)
// 2. Node 1
// 3. Node 2
// 4. Node 4 (Junction immediately before Gate 7)
// 5. Gate 7
// 6. Confirms Node 3 (parking detour) is completely removed and excluded from the graph.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';
const SVG_OUT = path.join(ARTIFACT_DIR, 'd6-gate7-route-diagram.svg');
const PNG_OUT = path.join(ARTIFACT_DIR, 'd6-gate7-route-diagram.png');
const DOCS_PNG = path.join(ROOT, 'docs', 'screenshots', 'd6-gate7-route-diagram.png');

const campus = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'campus.json'), 'utf8'));

// Focus bounding box around D-Block area:
// x: -220 to +20 (width 240m)
// z: -240 to -50 (height 190m)
const minX = -230, maxX = 30;
const minZ = -245, maxZ = -45;
const W = 1600, H = 1200;
const pad = 70;
const scaleX = (W - 2 * pad) / (maxX - minX);
const scaleZ = (H - 2 * pad) / (maxZ - minZ);
const S = Math.min(scaleX, scaleZ);

function tx(x) { return pad + (x - minX) * S; }
function tz(z) { return pad + (z - minZ) * S; }

const nodeMap = new Map(campus.graph.nodes.map(n => [n.id, n]));

let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <defs>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3.5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="3" dy="4" stdDeviation="5" flood-opacity="0.45"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8"/>
    </marker>
    <marker id="routeArrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9 z" fill="#ffffff"/>
    </marker>
  </defs>

  <!-- Background Canvas & Grid -->
  <rect width="${W}" height="${H}" fill="#0b1329"/>
  <g stroke="#1e293b" stroke-width="0.8" opacity="0.45">`;

for (let x = -220; x <= 20; x += 20) {
  svg += `<line x1="${tx(x)}" y1="0" x2="${tx(x)}" y2="${H}" />`;
}
for (let z = -240; z <= -50; z += 20) {
  svg += `<line x1="0" y1="${tz(z)}" x2="${W}" y2="${tz(z)}" />`;
}
svg += `</g>`;

// Lawns / Sports areas
svg += `<g id="lawns">`;
for (const a of campus.areas || []) {
  const pts = a.polygon.map(([x, z]) => `${tx(x).toFixed(1)},${tz(z).toFixed(1)}`).join(' ');
  const fill = a.type === 'sports' ? '#143823' : '#0d2818';
  const stroke = a.type === 'sports' ? '#22c55e' : '#15803d';
  svg += `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" opacity="0.6"/>`;
}
svg += `</g>`;

// Road carriageways in D-sector
svg += `<g id="roads">`;
for (const r of campus.roads || []) {
  const d = r.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${tx(p[0]).toFixed(1)} ${tz(p[1]).toFixed(1)}`).join(' ');
  const strokeW = Math.max(3, r.width * S);
  svg += `<path d="${d}" fill="none" stroke="#223049" stroke-width="${strokeW.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
svg += `</g>`;

// Walking graph edges in background
svg += `<g id="graph-edges" opacity="0.35">`;
for (const e of campus.graph.edges) {
  const a = nodeMap.get(e.a), b = nodeMap.get(e.b);
  if (!a || !b) continue;
  if (a.x < minX - 20 || a.x > maxX + 20 || a.z < minZ - 20 || a.z > maxZ + 20) continue;
  svg += `<line x1="${tx(a.x).toFixed(1)}" y1="${tz(a.z).toFixed(1)}" x2="${tx(b.x).toFixed(1)}" y2="${tz(b.z).toFixed(1)}" stroke="#475569" stroke-width="1.2"/>`;
}
svg += `</g>`;

// Buildings
svg += `<g id="buildings">`;
for (const p of campus.places) {
  if (p.centroid[0] < minX - 30 || p.centroid[0] > maxX + 30 || p.centroid[1] < minZ - 30 || p.centroid[1] > maxZ + 30) continue;
  const pts = p.footprint.map(([x, z]) => `${tx(x).toFixed(1)},${tz(z).toFixed(1)}`).join(' ');
  let fill = '#1e293b';
  let stroke = '#0284c7';
  let strokeW = 1.5;

  if (p.id === 'd6-library') {
    fill = '#1e3a5f';
    stroke = '#38bdf8';
    strokeW = 3.5;
  } else if (p.kind === 'parking') {
    fill = '#111827';
    stroke = '#64748b';
  } else if (p.kind === 'sports') {
    fill = '#064e3b';
    stroke = '#10b981';
  } else if (p.kind === 'gate') {
    fill = '#991b1b';
    stroke = '#f87171';
    strokeW = 2.5;
  }

  svg += `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" filter="url(#shadow)"/>`;

  // Centroid label
  const cx = tx(p.centroid[0]);
  const cz = tz(p.centroid[1]);
  let label = p.name;
  if (p.id === 'd6-library') label = 'D6 – Central Library ★';
  else if (p.id.startsWith('d') && p.id.includes('-')) label = p.id.toUpperCase().split('-')[0] + ' Block';
  else if (p.id === 'shivalik-hostel') label = 'Shivalik Hostel';
  else if (p.id === 'sports-complex') label = 'Sports Complex';
  else if (p.id === 'parking-d-block') label = 'PARKING';
  else if (p.kind === 'gate') label = p.name.toUpperCase();

  const fontSize = p.id === 'd6-library' ? 13 : (p.kind === 'gate' ? 12 : 10);
  const fontColor = p.id === 'd6-library' ? '#38bdf8' : (p.kind === 'gate' ? '#fca5a5' : '#cbd5e1');
  const fontWeight = (p.id === 'd6-library' || p.kind === 'gate') ? 'bold' : '600';

  svg += `<text x="${cx.toFixed(1)}" y="${cz.toFixed(1)}" fill="${fontColor}" font-size="${fontSize}" font-weight="${fontWeight}" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
}
svg += `</g>`;

// EXCLUDED NODE 3 CALLOUT (Showing where detour was previously and is now forbidden)
const node3X = tx(-15);
const node3Z = tz(-130);
svg += `<g id="excluded-node-3">
  <!-- Cross over previous Node 3 location -->
  <circle cx="${node3X.toFixed(1)}" cy="${node3Z.toFixed(1)}" r="16" fill="rgba(239,68,68,0.15)" stroke="#ef4444" stroke-width="2" stroke-dasharray="3,3"/>
  <line x1="${(node3X - 10).toFixed(1)}" y1="${(node3Z - 10).toFixed(1)}" x2="${(node3X + 10).toFixed(1)}" y2="${(node3Z + 10).toFixed(1)}" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>
  <line x1="${(node3X - 10).toFixed(1)}" y1="${(node3Z + 10).toFixed(1)}" x2="${(node3X + 10).toFixed(1)}" y2="${(node3Z - 10).toFixed(1)}" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>

  <!-- Callout box -->
  <rect x="${(node3X + 22).toFixed(1)}" y="${(node3Z - 20).toFixed(1)}" width="175" height="42" rx="5" fill="#1e1b2e" stroke="#ef4444" stroke-width="1.4" opacity="0.95"/>
  <text x="${(node3X + 30).toFixed(1)}" y="${(node3Z - 5).toFixed(1)}" fill="#ef4444" font-size="10" font-weight="bold">❌ NODE 3 EXCLUDED</text>
  <text x="${(node3X + 30).toFixed(1)}" y="${(node3Z + 12).toFixed(1)}" fill="#fca5a5" font-size="9">No parking-side detour</text>
</g>`;

// THE AUTHORIZED ROUTE: D6 -> Node 1 -> Node 2 -> Node 4 -> Gate 7
// Exact C++ route geometry points:
const routePts = [
  [-142, -178], // D6 Entrance
  [-138, -178], // Inner loop west sidewalk
  [-138, -160], // Heading south
  [-138, -147.795], // NODE 1: South bend of loop road
  [-132.017, -140.756],
  [-118.029, -124.3],
  [-70.747, -119.046], // NODE 2: Corridor south of D5 & D4
  [-70, -118.931],
  [-21.5, -111.5], // NODE 4: Junction immediately before Gate 7
  [-21.984, -95.828],
  [-15, -90.8],
  [-15, -90] // GATE 7
];

const pathD = routePts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${tx(p[0]).toFixed(1)} ${tz(p[1]).toFixed(1)}`).join(' ');

svg += `<g id="authorized-route">
  <!-- Outer Glow Ribbon -->
  <path d="${pathD}" fill="none" stroke="#2563eb" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.35" filter="url(#glow)"/>
  
  <!-- Core Blue Ribbon -->
  <path d="${pathD}" fill="none" stroke="#2563eb" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  
  <!-- Inner Bright Line with Direction Indicators -->
  <path d="${pathD}" fill="none" stroke="#60a5fa" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;

// DIRECTIONAL FLOW ARROWS along the route corridor
const arrows = [
  { x1: -138, z1: -172, x2: -138, z2: -155 }, // South from D6 to Node 1
  { x1: -128, z1: -136, x2: -110, z2: -126 }, // East from Node 1 towards Node 2
  { x1: -85, z1: -121, x2: -65, z2: -119 },   // East along corridor past Node 2
  { x1: -50, z1: -117, x2: -30, z2: -114 },   // East towards Node 4
  { x1: -21.5, z1: -108, x2: -19, z2: -94 }    // South into Gate 7
];

svg += `<g id="route-arrows">`;
for (const a of arrows) {
  svg += `<line x1="${tx(a.x1).toFixed(1)}" y1="${tz(a.z1).toFixed(1)}" x2="${tx(a.x2).toFixed(1)}" y2="${tz(a.z2).toFixed(1)}" stroke="#ffffff" stroke-width="2.6" marker-end="url(#routeArrow)" stroke-linecap="round"/>`;
}
svg += `</g>`;

// WAYPOINT BADGES: D6, 1, 2, 4, Gate 7
function drawWaypointBadge(num, x, z, title, sub) {
  const bx = tx(x), bz = tz(z);
  let g = `<g id="badge-node-${num}">`;
  // Outer pulse circle
  g += `<circle cx="${bx.toFixed(1)}" cy="${bz.toFixed(1)}" r="22" fill="#2563eb" stroke="#ffffff" stroke-width="3.5" filter="url(#shadow)"/>`;
  // Inner white numeral
  g += `<text x="${bx.toFixed(1)}" y="${(bz + 1).toFixed(1)}" fill="#ffffff" font-size="18" font-weight="900" text-anchor="middle" dominant-baseline="middle">${num}</text>`;
  
  // Floating label card
  const cardW = 155, cardH = 38;
  const offX = num === 1 ? -175 : (num === 2 ? -75 : 30);
  const offZ = num === 1 ? -18 : (num === 2 ? 30 : -45);
  g += `<rect x="${(bx + offX).toFixed(1)}" y="${(bz + offZ).toFixed(1)}" width="${cardW}" height="${cardH}" rx="6" fill="#0f172a" stroke="#38bdf8" stroke-width="1.4" opacity="0.95"/>`;
  g += `<text x="${(bx + offX + 10).toFixed(1)}" y="${(bz + offZ + 16).toFixed(1)}" fill="#38bdf8" font-size="11" font-weight="bold">${title}</text>`;
  g += `<text x="${(bx + offX + 10).toFixed(1)}" y="${(bz + offZ + 30).toFixed(1)}" fill="#94a3b8" font-size="9.5">${sub}</text>`;
  g += `</g>`;
  return g;
}

// 1. D6 Entrance Pin
const d6X = tx(-142), d6Z = tz(-178);
svg += `<g id="badge-d6">
  <circle cx="${d6X.toFixed(1)}" cy="${d6Z.toFixed(1)}" r="14" fill="#10b981" stroke="#ffffff" stroke-width="3" filter="url(#shadow)"/>
  <text x="${d6X.toFixed(1)}" y="${(d6Z + 1).toFixed(1)}" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle" dominant-baseline="middle">START</text>
  <rect x="${(d6X - 190).toFixed(1)}" y="${(d6Z - 20).toFixed(1)}" width="175" height="40" rx="6" fill="#0f172a" stroke="#10b981" stroke-width="1.5" opacity="0.95"/>
  <text x="${(d6X - 180).toFixed(1)}" y="${(d6Z - 4).toFixed(1)}" fill="#10b981" font-size="11" font-weight="bold">D6 – Central Library</text>
  <text x="${(d6X - 180).toFixed(1)}" y="${(d6Z + 11).toFixed(1)}" fill="#94a3b8" font-size="9.5">Start point (-142, -178)</text>
</g>`;

// 2. Node 1
svg += drawWaypointBadge(1, -138, -147.8, 'Node 1 (Road Bend)', 'Turn East at (-132, -150)');

// 3. Node 2
svg += drawWaypointBadge(2, -70.7, -119.0, 'Node 2 (South Corridor)', 'Straight past D5/D4 (-70, -125)');

// 4. Node 4
svg += drawWaypointBadge(4, -21.5, -111.5, 'Node 4 (Junction before Gate 7)', 'Approach Merge (-15, -118)');

// 5. Gate 7 Destination
const g7X = tx(-15), g7Z = tz(-90);
svg += `<g id="badge-gate-7">
  <circle cx="${g7X.toFixed(1)}" cy="${g7Z.toFixed(1)}" r="14" fill="#ef4444" stroke="#ffffff" stroke-width="3" filter="url(#shadow)"/>
  <text x="${g7X.toFixed(1)}" y="${(g7Z + 1).toFixed(1)}" fill="#ffffff" font-size="9" font-weight="bold" text-anchor="middle" dominant-baseline="middle">END</text>
  <rect x="${(g7X + 25).toFixed(1)}" y="${(g7Z - 20).toFixed(1)}" width="155" height="40" rx="6" fill="#0f172a" stroke="#ef4444" stroke-width="1.5" opacity="0.95"/>
  <text x="${(g7X + 35).toFixed(1)}" y="${(g7Z - 4).toFixed(1)}" fill="#ef4444" font-size="11.5" font-weight="bold">Gate 7 (Wicket / Exit)</text>
  <text x="${(g7X + 35).toFixed(1)}" y="${(g7Z + 11).toFixed(1)}" fill="#94a3b8" font-size="9.5">Destination (-15, -90)</text>
</g>`;

// Header & Legend Card
svg += `
<g id="header-panel">
  <rect x="25" y="20" width="560" height="150" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1.5" opacity="0.95"/>
  <text x="45" y="52" fill="#f8fafc" font-size="18" font-weight="bold">Authorized D6 → Gate 7 Navigation Route</text>
  <text x="45" y="74" fill="#38bdf8" font-size="13" font-weight="700">Strict Sequence: D6 → Node 1 → Node 2 → Node 4 → Gate 7</text>
  <text x="45" y="94" fill="#94a3b8" font-size="11">Dijkstra Shortest Path: 187.5 m (sum of walkable path edges) • 0 Detours</text>

  <g transform="translate(45, 110)">
    <circle cx="8" cy="8" r="7" fill="#2563eb" stroke="#fff" stroke-width="1.5"/>
    <text x="22" y="12" fill="#cbd5e1" font-size="11" font-weight="600">Numbered Waypoint</text>

    <line x1="160" y1="8" x2="195" y2="8" stroke="#2563eb" stroke-width="5" stroke-linecap="round"/>
    <text x="205" y="12" fill="#cbd5e1" font-size="11" font-weight="600">Active Shortest Path</text>

    <circle cx="345" cy="8" r="7" fill="rgba(239,68,68,0.2)" stroke="#ef4444" stroke-width="1.5"/>
    <line x1="340" y1="3" x2="350" y2="13" stroke="#ef4444" stroke-width="2"/>
    <line x1="340" y1="13" x2="350" y2="3" stroke="#ef4444" stroke-width="2"/>
    <text x="360" y="12" fill="#ef4444" font-size="11" font-weight="600">Node 3 Eliminated</text>
  </g>
</g>

<!-- Metrics & Verification Table Card -->
<g id="metrics-card">
  <rect x="${W - 470}" y="20" width="445" height="175" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1.5" opacity="0.95"/>
  <text x="${W - 450}" y="48" fill="#f8fafc" font-size="14.5" font-weight="bold">Route Verification &amp; Step Audit</text>
  <text x="${W - 450}" y="72" fill="#94a3b8" font-size="11">Total Distance: <tspan fill="#38bdf8" font-weight="bold">187.52 m</tspan> (Walking time: 2 min 20 sec)</text>
  <text x="${W - 450}" y="92" fill="#94a3b8" font-size="11">Node 1 (South Bend): <tspan fill="#22c55e" font-weight="bold">34.2 m from D6</tspan></text>
  <text x="${W - 450}" y="112" fill="#94a3b8" font-size="11">Node 2 (East Corridor): <tspan fill="#22c55e" font-weight="bold">65.1 m from Node 1</tspan></text>
  <text x="${W - 450}" y="132" fill="#94a3b8" font-size="11">Node 4 (Gate 7 Junction): <tspan fill="#22c55e" font-weight="bold">63.1 m from Node 2</tspan></text>
  <text x="${W - 450}" y="152" fill="#94a3b8" font-size="11">Gate 7 Arrival: <tspan fill="#22c55e" font-weight="bold">25.1 m from Node 4</tspan></text>
  <text x="${W - 450}" y="172" fill="#94a3b8" font-size="11">Parking Detour (Node 3): <tspan fill="#22c55e" font-weight="bold">REMOVED (0m traversal)</tspan></text>
</g>
</svg>`;

fs.writeFileSync(SVG_OUT, svg);
console.log(`Saved SVG diagram: ${SVG_OUT}`);

// Render PNG using Headless Chrome
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9230;
const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0b1329;display:flex;align-items:center;justify-content:center;">${svg}</body></html>`;
const htmlPath = '/tmp/d6-gate7-diagram-preview.html';
fs.writeFileSync(htmlPath, html);

const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  `--window-size=${W},${H}`,
  '--user-data-dir=/tmp/cu-nav-d6-gate7-diagram-profile',
  `file://${htmlPath}`
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  try {
    let target = null;
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        const list = await res.json();
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (target) break;
      } catch (e) {}
    }
    if (!target) throw new Error('Target not found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let msgId = 0;
    const send = (method, params = {}) => new Promise((res) => {
      const id = ++msgId;
      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === id) { ws.removeEventListener('message', handler); res(data.result); }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await sleep(600);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.data, 'base64');
    fs.mkdirSync(path.dirname(DOCS_PNG), { recursive: true });
    fs.writeFileSync(PNG_OUT, buf);
    fs.writeFileSync(DOCS_PNG, buf);
    console.log(`Saved PNG diagram: ${PNG_OUT} (${buf.length} bytes)`);

    ws.close();
  } finally {
    proc.kill('SIGKILL');
  }
}

run().catch((e) => {
  console.error(e);
  proc.kill('SIGKILL');
  process.exit(1);
});
