// Script to capture a crystal-clear top-down view of the C-block area using Chrome DevTools Protocol
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const URL = 'http://127.0.0.1:5173/?view=c-block';
const OUT_DOCS = 'docs/screenshots/c-block-topdown.png';
const OUT_ARTIFACT = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c/c-block-topdown.png';

console.log('Launching headless Chrome with CDP on port', PORT);
const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--window-size=1400,1000',
  '--user-data-dir=/tmp/cu-nav-chrome-profile',
  URL
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  try {
    // Wait for Chrome CDP port
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

    if (!target) {
      throw new Error('Chrome CDP page target not found');
    }

    console.log('Connecting to Chrome target via WebSocket:', target.webSocketDebuggerUrl);
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

    // Enable Page and Emulation
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1400,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Wait for body[data-ready="1"]
    console.log('Waiting for campus 3D scene to be ready...');
    for (let i = 0; i < 40; i++) {
      const r = await send('Runtime.evaluate', {
        expression: 'Boolean(document.body.dataset.ready === "1" && window.__app && window.__app.stage)'
      });
      if (r?.result?.value === true) break;
      await sleep(300);
    }

    // Set precise top-down framing of the C-Block area
    console.log('Framing top-down camera view on C-Block area...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        window.__capturing = true;
        const app = window.__app;
        if (!app) return;
        app.stage.paused = false;
        app.stage.resize();
        document.querySelector('#panel')?.classList.add('collapsed');
        // Center around Main Ground and C-blocks: x = 250, z = 5
        // Distance 240 gives crisp top-down framing of C1, C2, Food Republic, Main Ground, C3, and Staff Quarters
        app.stage.setView({ x: 250, z: 5, distance: 240, azimuth: 0, polar: 0.001 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
        app.labels.update();
      })()`
    });

    await sleep(1000); // Allow labels and shadow pass to render smoothly

    // Render one more time right before capturing
    await send('Runtime.evaluate', {
      expression: `(() => {
        const app = window.__app;
        if (app) {
          app.stage.renderer.render(app.stage.scene, app.stage.camera);
          app.labels.update();
        }
      })()`
    });

    console.log('Capturing screenshot...');
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 1400, height: 1000, scale: 1 }
    });
    const buffer = Buffer.from(shot.data, 'base64');

    fs.mkdirSync(path.dirname(OUT_DOCS), { recursive: true });
    fs.writeFileSync(OUT_DOCS, buffer);
    fs.writeFileSync(OUT_ARTIFACT, buffer);
    console.log('Saved top-down screenshot to:', OUT_DOCS, 'and', OUT_ARTIFACT);

    ws.close();
  } finally {
    proc.kill('SIGKILL');
  }
}

run().catch((err) => {
  console.error('Error capturing screenshot:', err);
  proc.kill('SIGKILL');
  process.exit(1);
});
