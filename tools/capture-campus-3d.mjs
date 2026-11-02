import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9227;
const URL = 'http://127.0.0.1:5173';
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';
const TOPDOWN_PNG = path.join(ARTIFACT_DIR, 'campus-3d-topdown.png');
const B3_B4_PNG = path.join(ARTIFACT_DIR, 'campus-3d-b3-b4.png');
const D6_PNG = path.join(ARTIFACT_DIR, 'campus-3d-d6.png');
const ROUTE_PNG = path.join(ARTIFACT_DIR, 'campus-3d-route.png');

console.log('Launching headless Chrome for full campus 3D verification screenshots...');
const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--window-size=1500,1050',
  '--user-data-dir=/tmp/cu-nav-campus-profile',
  URL
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  try {
    let target = null;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        const list = await res.json();
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (target) break;
      } catch (e) {}
    }

    if (!target) throw new Error('Chrome CDP page target not found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 0;
    const send = (method, params = {}) => new Promise((resolve) => {
      const id = ++msgId;
      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === id) {
          ws.removeEventListener('message', handler);
          resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1500,
      height: 1050,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Wait for 3D app ready
    for (let i = 0; i < 40; i++) {
      const r = await send('Runtime.evaluate', {
        expression: 'Boolean(document.body.dataset.ready === "1" && window.__app && window.__app.stage)'
      });
      if (r?.result?.value === true) break;
      await sleep(300);
    }

    // Shot 1: Top-down overview of full 3D campus
    console.log('Capturing Top-down overview of full 3D campus...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        window.__capturing = true;
        const app = window.__app;
        if (!app) return;
        app.stage.paused = false;
        app.stage.resize();
        document.querySelector('#panel')?.classList.add('collapsed');
        // Center on campus: x=60, z=-50, distance=980, top-down
        app.stage.setView({ x: 60, z: -50, distance: 980, azimuth: 0, polar: 0.001 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
        app.labels.update();
      })()`
    });
    await sleep(2000);

    const shot1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(TOPDOWN_PNG, Buffer.from(shot1.data, 'base64'));
    console.log('Saved top-down 3D shot:', TOPDOWN_PNG);

    // Shot 2: Close-up of B3 – DSW and B4 – Kalpana Chawla Space & Research Centre
    console.log('Capturing Close-up isometric of B3 – DSW & B4 – Kalpana Chawla...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const app = window.__app;
        if (!app) return;
        // Focus on B-Block sector: x=240, z=-100, distance=340, oblique angle
        app.stage.setView({ x: 240, z: -100, distance: 340, azimuth: -0.5, polar: 0.92 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
        app.labels.update();
      })()`
    });
    await sleep(1500);

    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(B3_B4_PNG, Buffer.from(shot2.data, 'base64'));
    console.log('Saved B3 & B4 3D shot:', B3_B4_PNG);

    // Shot 3: Close-up of D6 – Central Library
    console.log('Capturing Close-up isometric of D6 – Central Library...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const app = window.__app;
        if (!app) return;
        // Focus on D-Block cluster & D6 Library
        app.stage.setView({ x: -110, z: -180, distance: 320, azimuth: -0.35, polar: 0.92 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
        app.labels.update();
      })()`
    });
    await sleep(1500);

    const shot3 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(D6_PNG, Buffer.from(shot3.data, 'base64'));
    console.log('Saved D6 Central Library 3D shot:', D6_PNG);

    // Shot 4: Active Dijkstra navigation route: Gate 2 to B4 – Kalpana Chawla
    console.log('Capturing Active Dijkstra navigation route in 3D...');
    await send('Runtime.evaluate', {
      expression: `(async () => {
        const app = window.__app;
        if (!app) return;
        document.querySelector('#panel')?.classList.remove('collapsed');
        app.setEndpoint('from', { type: 'place', id: 'gate-2' }, { route: false });
        app.setEndpoint('to', { type: 'place', id: 'b4-engineering' }, { route: false });
        await app.requestRoute();
        await new Promise(r => setTimeout(r, 600));
        app.stage.setView({ x: 230, z: -170, distance: 380, azimuth: -0.4, polar: 0.90 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
        app.labels.update();
      })()`
    });
    await sleep(2500);

    const shot4 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(ROUTE_PNG, Buffer.from(shot4.data, 'base64'));
    console.log('Saved route 3D shot:', ROUTE_PNG);

    ws.close();
  } finally {
    proc.kill();
  }
}

run().catch((err) => {
  console.error(err);
  proc.kill();
  process.exit(1);
});
