import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9224;
const URL = 'http://127.0.0.1:5173';
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';
const TOPDOWN_PNG = path.join(ARTIFACT_DIR, 'gate2-c-sector-3d-topdown.png');
const ISOMETRIC_PNG = path.join(ARTIFACT_DIR, 'gate2-c-sector-3d-iso.png');

console.log('Launching headless Chrome for 3D verification screenshots...');
const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--window-size=1400,1000',
  '--user-data-dir=/tmp/cu-nav-3d-profile',
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
      width: 1400,
      height: 1000,
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

    // Shot 1: Top-down view
    console.log('Capturing Top-down 3D view of Gate 2 to C1/C2 / Main Ground sector...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        window.__capturing = true;
        const app = window.__app;
        if (!app) return;
        app.stage.paused = false;
        app.stage.resize();
        document.querySelector('#panel')?.classList.add('collapsed');
        // Center on sector: x=300, z=-90, distance=360, top-down
        app.stage.setView({ x: 300, z: -90, distance: 380, azimuth: 0, polar: 0.001 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
        app.labels.update();
      })()`
    });
    await sleep(1200);

    const shot1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(TOPDOWN_PNG, Buffer.from(shot1.data, 'base64'));
    console.log('Saved top-down 3D shot:', TOPDOWN_PNG);

    // Shot 2: Isometric perspective view
    console.log('Capturing Isometric 3D view of Gate 2 to C1/C2 / Main Ground sector...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const app = window.__app;
        if (!app) return;
        // Oblique perspective angle to show vertical layers & road flatness
        app.stage.setView({ x: 300, z: -90, distance: 400, azimuth: -0.45, polar: 0.95 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
        app.labels.update();
      })()`
    });
    await sleep(1200);

    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(ISOMETRIC_PNG, Buffer.from(shot2.data, 'base64'));
    console.log('Saved isometric 3D shot:', ISOMETRIC_PNG);

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
