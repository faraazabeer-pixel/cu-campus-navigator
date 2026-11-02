import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9229;
const URL = 'http://127.0.0.1:5173';
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';
const DOCS_DIR = 'docs/screenshots';

const TOPDOWN_PNG = path.join(ARTIFACT_DIR, 'd6-gate7-route-topdown.png');
const ISO_PNG = path.join(ARTIFACT_DIR, 'd6-gate7-route-iso.png');
const DOCS_TOPDOWN = path.join(DOCS_DIR, 'd6-gate7-route-topdown.png');
const DOCS_ISO = path.join(DOCS_DIR, 'd6-gate7-route-iso.png');

console.log('Launching headless Chrome for D6 -> Gate 7 route verification screenshots...');
const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--window-size=1500,1050',
  '--user-data-dir=/tmp/cu-nav-d6-gate7-profile',
  URL
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  try {
    let target = null;
    for (let i = 0; i < 35; i++) {
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

    // Shot 1: Top-down view of D6 -> Gate 7 route
    console.log('Requesting route D6 -> Gate 7 and capturing Top-down 3D view...');
    await send('Runtime.evaluate', {
      expression: `(async () => {
        window.__capturing = true;
        const app = window.__app;
        if (!app) return;
        app.stage.paused = false;
        app.stage.resize();
        document.querySelector('#panel')?.classList.remove('collapsed');
        app.setEndpoint('from', { type: 'place', id: 'd6-library' }, { route: false });
        app.setEndpoint('to', { type: 'place', id: 'gate-7' }, { route: false });
        await app.requestRoute();
        await new Promise(r => setTimeout(r, 600));
        // View centered on D6 - Gate 7 corridor: x=-80, z=-135, top-down
        app.stage.setView({ x: -80, z: -135, distance: 280, azimuth: 0, polar: 0.001 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
        app.labels.update();
      })()`
    });
    await sleep(2500);

    const shot1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(DOCS_TOPDOWN), { recursive: true });
    fs.writeFileSync(TOPDOWN_PNG, Buffer.from(shot1.data, 'base64'));
    fs.writeFileSync(DOCS_TOPDOWN, Buffer.from(shot1.data, 'base64'));
    console.log('Saved Top-down shot:', TOPDOWN_PNG);

    // Shot 2: Isometric 3D view showing D6, 1, 2, 4, Gate 7 and route step panel
    console.log('Capturing Isometric 3D view with step panel and route badges...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const app = window.__app;
        if (!app) return;
        // Isometric perspective angle focusing on D6 -> Gate 7
        app.stage.setView({ x: -75, z: -140, distance: 290, azimuth: -0.32, polar: 0.90 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
        app.labels.update();
      })()`
    });
    await sleep(2000);

    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(ISO_PNG, Buffer.from(shot2.data, 'base64'));
    fs.writeFileSync(DOCS_ISO, Buffer.from(shot2.data, 'base64'));
    console.log('Saved Isometric shot:', ISO_PNG);

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
