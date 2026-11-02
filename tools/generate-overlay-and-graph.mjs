import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getSectorModel, buildGraph } from './verify-dijkstra-d-block.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9230;
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';
const REF_IMG_URL = `file:///Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c/d-block-reference-handdrawn.jpg`;

const OVERLAY_PNG = path.join(ARTIFACT_DIR, 'd-block-overlay.png');
const GRAPH_PNG = path.join(ARTIFACT_DIR, 'd-block-graph.png');
const PREVIEW_PNG = path.join(ARTIFACT_DIR, 'd-block-preview.png');
const DOCS_DIR = 'docs/screenshots';

const { roads, buildings, parkings, gates, entrancePaths } = getSectorModel();
const { nodes: graphNodes, edges: graphEdges } = buildGraph();

// Compute optimal Projective Homography from (x, z) to (u, v) on the 764x1024 hand-drawn map
// Anchors: Gate 3, Gate 7, Gate 8, Gate 4, B4, D8, D1, D6
const pairs = [
  { x: -51, z: -284, u: 428, v: 154 },  // Gate 3
  { x: -15, z: -90,  u: 386, v: 564 },  // Gate 7
  { x: -268, z: -68, u: 124, v: 610 },  // Gate 8
  { x: 212, z: 65,   u: 728, v: 822 },  // Gate 4
  { x: 190, z: -94,  u: 742, v: 586 },  // B4
  { x: -95, z: -250, u: 350, v: 248 },  // D8
  { x: -152, z: -178, u: 178, v: 426 }, // D6 Star
  { x: -70, z: -205, u: 345, v: 388 }   // D1 North
];

// Solve 8-point homography: [u, v, 1]^T ~ H * [x, z, 1]^T
function solveHomography(pts) {
  // Build 2N x 8 matrix
  const A = [];
  const B = [];
  for (const p of pts) {
    A.push([p.x, p.z, 1, 0, 0, 0, -p.u * p.x, -p.u * p.z]);
    B.push(p.u);
    A.push([0, 0, 0, p.x, p.z, 1, -p.v * p.x, -p.v * p.z]);
    B.push(p.v);
  }
  // Least squares: (A^T A) h = A^T B
  const AT = Array.from({ length: 8 }, (_, i) => Array.from({ length: A.length }, (_, j) => A[j][i]));
  const ATA = Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => {
    let s = 0;
    for (let k = 0; k < A.length; k++) s += AT[i][k] * A[k][j];
    return s;
  }));
  const ATB = Array.from({ length: 8 }, (_, i) => {
    let s = 0;
    for (let k = 0; k < A.length; k++) s += AT[i][k] * B[k];
    return s;
  });

  // Solve 8x8 via Gaussian elimination
  const M = ATA.map((row, i) => [...row, ATB[i]]);
  for (let i = 0; i < 8; i++) {
    let maxR = i;
    for (let k = i + 1; k < 8; k++) if (Math.abs(M[k][i]) > Math.abs(M[maxR][i])) maxR = k;
    [M[i], M[maxR]] = [M[maxR], M[i]];
    const pivot = M[i][i];
    for (let j = i; j <= 8; j++) M[i][j] /= pivot;
    for (let k = 0; k < 8; k++) {
      if (k === i) continue;
      const f = M[k][i];
      for (let j = i; j <= 8; j++) M[k][j] -= f * M[i][j];
    }
  }
  const h = M.map(row => row[8]);
  return (x, z) => {
    const denom = h[6] * x + h[7] * z + 1;
    const u = (h[0] * x + h[1] * z + h[2]) / denom;
    const v = (h[3] * x + h[4] * z + h[5]) / denom;
    return [u, v];
  };
}

const toPixel = solveHomography(pairs);

// Verify homography accuracy
console.log('Homography verification on calibration landmarks:');
for (const p of pairs) {
  const [u, v] = toPixel(p.x, p.z);
  console.log(`  ${p.u}, ${p.v} -> predicted ${Math.round(u)}, ${Math.round(v)} (error: ${Math.hypot(u - p.u, v - p.v).toFixed(1)} px)`);
}

// -------------------------------------------------------------
// HTML Page 1: Reconstructed Layout Preview (Clean Vector Plan)
// -------------------------------------------------------------
const minX = -260, maxX = 240, minZ = -335, maxZ = 135;
const previewSvgPath = path.join(ARTIFACT_DIR, 'd-block-preview.svg');
const svgContent = fs.readFileSync(previewSvgPath, 'utf8');
const previewHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef3eb;display:flex;align-items:center;justify-content:center;">${svgContent}</body></html>`;
fs.writeFileSync('/tmp/preview.html', previewHtml);

// -------------------------------------------------------------
// HTML Page 2: Overlay over Hand-Drawn Reference
// -------------------------------------------------------------
const overlayHtml = `<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; padding: 0; background: #111; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  #wrap { position: relative; width: 764px; height: 1024px; }
  #bg { position: absolute; left: 0; top: 0; width: 764px; height: 1024px; }
  #svg { position: absolute; left: 0; top: 0; width: 764px; height: 1024px; pointer-events: none; }
</style>
</head>
<body>
<div id="wrap">
  <img id="bg" src="${REF_IMG_URL}" />
  <svg id="svg" viewBox="0 0 764 1024" width="764" height="1024">
    <!-- Reconstructed Roads Overlay -->
    <g class="overlay-roads" opacity="0.85">
      ${roads.map(r => {
        const d = r.points.map((p, i) => {
          const [u, v] = toPixel(p[0], p[1]);
          return `${i === 0 ? 'M' : 'L'} ${u.toFixed(1)} ${v.toFixed(1)}`;
        }).join(' ');
        // Render road ribbon
        const w = (r.width * 1.5).toFixed(1);
        return `
          <path d="${d}" fill="none" stroke="#0284c7" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="0.45" />
          <path d="${d}" fill="none" stroke="#06b6d4" stroke-width="${Math.max(3, w * 0.45).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" />
          <path d="${d}" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="4,4" />
        `;
      }).join('')}
    </g>

    <!-- Reconstructed Building Outlines Overlay -->
    <g class="overlay-buildings">
      ${buildings.map(b => {
        const pts = b.poly.map(p => toPixel(p[0], p[1]).map(v => v.toFixed(1)).join(',')).join(' ');
        const fill = b.id === 'd6' ? 'rgba(245, 158, 11, 0.4)' : (b.isCorridor ? 'rgba(59, 130, 246, 0.5)' : 'rgba(239, 68, 68, 0.25)');
        const stroke = b.id === 'd6' ? '#d97706' : (b.isCorridor ? '#2563eb' : '#dc2626');
        return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
      }).join('')}
    </g>

    <!-- Parking Overlay -->
    <g class="overlay-parking">
      ${parkings.map(p => {
        const pts = p.poly.map(pt => toPixel(pt[0], pt[1]).map(v => v.toFixed(1)).join(',')).join(' ');
        return `<polygon points="${pts}" fill="rgba(168, 85, 247, 0.3)" stroke="#9333ea" stroke-width="2" />`;
      }).join('')}
    </g>

    <!-- Gates Overlay -->
    <g class="overlay-gates">
      ${gates.map(g => {
        const [gu, gv] = toPixel(g.x, g.z);
        return `
          <g transform="translate(${gu.toFixed(1)}, ${gv.toFixed(1)})">
            <circle cx="0" cy="0" r="10" fill="#ef4444" stroke="#ffffff" stroke-width="2.5" />
            <text x="0" y="4" text-anchor="middle" font-size="9" font-weight="900" fill="#ffffff">G</text>
            <rect x="-32" y="-24" width="64" height="15" rx="3" fill="#0f172a" opacity="0.9" />
            <text x="0" y="-13" text-anchor="middle" font-size="8.5" font-weight="800" fill="#ffffff">${g.name}</text>
          </g>
        `;
      }).join('')}
    </g>

    <!-- Legend Overlay Banner -->
    <g transform="translate(20, 20)">
      <rect width="250" height="75" rx="6" fill="#0f172a" opacity="0.92" stroke="#334155" stroke-width="1.5" />
      <text x="12" y="22" font-size="12" font-weight="800" fill="#f8fafc">Direct Visual Alignment Overlay</text>
      <text x="12" y="38" font-size="9.5" font-weight="500" fill="#94a3b8">Cyan = Reconstructed Roads & Curves</text>
      <text x="12" y="52" font-size="9.5" font-weight="500" fill="#fca5a5">Red Outline = Reconstructed Footprints</text>
      <text x="12" y="66" font-size="9.5" font-weight="500" fill="#fef08a">Amber Star = D6 Library Location</text>
    </g>
  </svg>
</div>
</body>
</html>`;

fs.writeFileSync('/tmp/overlay.html', overlayHtml);

// -------------------------------------------------------------
// HTML Page 3: Connected Pedestrian Navigation Graph Diagram
// -------------------------------------------------------------
const graphSvgWidth = 1400, graphSvgHeight = 1100;
function toGraphSvg(x, z) {
  const sx = ((x - minX) / (maxX - minX)) * graphSvgWidth;
  const sy = ((z - minZ) / (maxZ - minZ)) * graphSvgHeight;
  return [sx.toFixed(1), sy.toFixed(1)];
}

const graphHtml = `<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; padding: 0; background: #0f172a; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
</style>
</head>
<body>
<svg viewBox="0 0 ${graphSvgWidth} ${graphSvgHeight}" width="${graphSvgWidth}" height="${graphSvgHeight}">
  <rect width="${graphSvgWidth}" height="${graphSvgHeight}" fill="#0b1120" />

  <!-- Graph Grid Lines -->
  <g stroke="#1e293b" stroke-width="1" stroke-dasharray="4,8" opacity="0.6">
    ${Array.from({ length: 15 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="${graphSvgHeight}" />`).join('')}
    ${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${i * 100}" x2="${graphSvgWidth}" y2="${i * 100}" />`).join('')}
  </g>

  <!-- Edges -->
  <g class="graph-edges">
    ${graphEdges.map(e => {
      const [x1, y1] = toGraphSvg(e.n1.x, e.n1.z);
      const [x2, y2] = toGraphSvg(e.n2.x, e.n2.z);
      const mx = ((Number(x1) + Number(x2)) / 2).toFixed(1);
      const my = ((Number(y1) + Number(y2)) / 2).toFixed(1);
      return `
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#38bdf8" stroke-width="2.5" opacity="0.8" />
        <rect x="${Number(mx) - 16}" y="${Number(my) - 9}" width="32" height="14" rx="3" fill="#0f172a" stroke="#0284c7" stroke-width="1" />
        <text x="${mx}" y="${Number(my) + 2}" text-anchor="middle" font-size="9" font-weight="700" fill="#e0f2fe">${e.len}m</text>
      `;
    }).join('')}
  </g>

  <!-- Nodes -->
  <g class="graph-nodes">
    ${graphNodes.map(n => {
      const [nx, ny] = toGraphSvg(n.x, n.z);
      const fill = n.kind === 'gate' ? '#ef4444' : (n.kind === 'entrance' ? '#10b981' : '#38bdf8');
      const stroke = '#ffffff';
      const r = n.kind === 'junction' ? 6 : 9;
      return `
        <circle cx="${nx}" cy="${ny}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2" />
        <text x="${nx}" y="${Number(ny) - (r + 4)}" text-anchor="middle" font-size="10.5" font-weight="800" fill="#f8fafc" stroke="#0f172a" stroke-width="3" paint-order="stroke">${n.id}: ${n.label}</text>
      `;
    }).join('')}
  </g>

  <!-- Title & Status Card -->
  <g transform="translate(35, 35)">
    <rect width="420" height="135" rx="8" fill="#1e293b" opacity="0.95" stroke="#334155" stroke-width="2" />
    <text x="20" y="30" font-size="16" font-weight="900" fill="#38bdf8">D-Block Connected Navigation Graph</text>
    <text x="20" y="52" font-size="11.5" font-weight="600" fill="#94a3b8">Graph Topology: ${graphNodes.length} Nodes • ${graphEdges.length} Edges</text>
    <line x1="20" y1="62" x2="400" y2="62" stroke="#334155" stroke-width="1" />
    <g transform="translate(20, 78)">
      <circle cx="6" cy="6" r="6" fill="#ef4444" />
      <text x="20" y="10" font-size="11" font-weight="700" fill="#f8fafc">Gates (Gate 3, 7, 8, 4)</text>

      <circle cx="190" cy="6" r="6" fill="#10b981" />
      <text x="204" y="10" font-size="11" font-weight="700" fill="#f8fafc">Building Entrances (D1–D8)</text>

      <circle cx="6" cy="28" r="5" fill="#38bdf8" />
      <text x="20" y="32" font-size="11" font-weight="700" fill="#f8fafc">Road Junctions</text>

      <line x1="190" y1="28" x2="215" y2="28" stroke="#38bdf8" stroke-width="2.5" />
      <text x="224" y="32" font-size="11" font-weight="700" fill="#f8fafc">Euclidean Walking Distance</text>
    </g>
  </g>
</svg>
</body>
</html>`;

fs.writeFileSync('/tmp/graph.html', graphHtml);

// -------------------------------------------------------------
// Capture Screenshots using Headless Chrome
// -------------------------------------------------------------
const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/cu-verification-profile',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  try {
    let target = null;
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        const list = await res.json();
        target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (target) break;
      } catch (e) {}
    }
    if (!target) throw new Error('Target not found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let msgId = 0;
    const send = (method, params = {}) => new Promise(resolve => {
      const id = ++msgId;
      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === id) { ws.removeEventListener('message', handler); resolve(data.result); }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Page.enable');

    // 1. Capture Overlay Image
    console.log('Capturing Overlay Image...');
    await send('Page.navigate', { url: 'file:///tmp/overlay.html' });
    await sleep(800);
    await send('Emulation.setDeviceMetricsOverride', { width: 764, height: 1024, deviceScaleFactor: 1, mobile: false });
    const shotOverlay = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 764, height: 1024, scale: 1 } });
    fs.writeFileSync(OVERLAY_PNG, Buffer.from(shotOverlay.data, 'base64'));
    if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
    fs.writeFileSync(path.join(DOCS_DIR, 'd-block-overlay.png'), Buffer.from(shotOverlay.data, 'base64'));
    console.log('Saved Overlay:', OVERLAY_PNG);

    // 2. Capture Graph Diagram
    console.log('Capturing Navigation Graph Image...');
    await send('Page.navigate', { url: 'file:///tmp/graph.html' });
    await sleep(800);
    await send('Emulation.setDeviceMetricsOverride', { width: graphSvgWidth, height: graphSvgHeight, deviceScaleFactor: 1, mobile: false });
    const shotGraph = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: graphSvgWidth, height: graphSvgHeight, scale: 1 } });
    fs.writeFileSync(GRAPH_PNG, Buffer.from(shotGraph.data, 'base64'));
    fs.writeFileSync(path.join(DOCS_DIR, 'd-block-graph.png'), Buffer.from(shotGraph.data, 'base64'));
    console.log('Saved Graph:', GRAPH_PNG);

    // 3. Capture 2D Plan Preview Image
    console.log('Capturing 2D Plan Preview Image...');
    await send('Page.navigate', { url: 'file:///tmp/preview.html' });
    await sleep(800);
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1128, deviceScaleFactor: 1, mobile: false });
    const shotPreview = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1200, height: 1128, scale: 1 } });
    fs.writeFileSync(PREVIEW_PNG, Buffer.from(shotPreview.data, 'base64'));
    fs.writeFileSync(path.join(DOCS_DIR, 'd-block-preview.png'), Buffer.from(shotPreview.data, 'base64'));
    console.log('Saved Preview:', PREVIEW_PNG);

    ws.close();
  } finally {
    proc.kill();
  }
}

run().catch(e => { console.error(e); proc.kill(); process.exit(1); });
