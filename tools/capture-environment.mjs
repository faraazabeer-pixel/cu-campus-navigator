// Script to capture screenshots of the upgraded 3D environment using Chrome DevTools Protocol
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9223;
const URL = 'http://127.0.0.1:5173/';
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';

console.log('Launching headless Chrome with CDP on port', PORT);
const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--window-size=1400,900',
  '--user-data-dir=/tmp/cu-nav-env-chrome-profile',
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

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1400,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log('Waiting for campus 3D scene to be ready...');
    for (let i = 0; i < 40; i++) {
      const r = await send('Runtime.evaluate', {
        expression: 'Boolean(document.body.dataset.ready === "1" && window.__app && window.__app.stage)'
      });
      if (r?.result?.value === true) break;
      await sleep(300);
    }

    const captureView = async (filename, setupJs) => {
      await send('Runtime.evaluate', { expression: setupJs });
      await sleep(1200);
      await send('Runtime.evaluate', {
        expression: `(() => {
          const app = window.__app;
          if (app) {
            app.stage.renderer.render(app.stage.scene, app.stage.camera);
            app.labels.update();
          }
        })()`
      });
      await sleep(300);
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: 1400, height: 900, scale: 1 }
      });
      const buffer = Buffer.from(shot.data, 'base64');
      const docsPath = path.join('docs/screenshots', filename);
      const artPath = path.join(ARTIFACT_DIR, filename);
      fs.mkdirSync(path.dirname(docsPath), { recursive: true });
      fs.writeFileSync(docsPath, buffer);
      fs.writeFileSync(artPath, buffer);
      console.log(`Captured ${filename}: ${buffer.length} bytes`);
    };

    // 1. Perspective aerial overview matching the visual reference image
    console.log('Capturing perspective overview...');
    const diag = await send('Runtime.evaluate', {
      expression: `(() => {
        const app = window.__app;
        return {
          hasSky: Boolean(app.stage.skyDome),
          skyPos: app.stage.skyDome.position,
          camPos: app.stage.camera.position,
          camFar: app.stage.camera.far,
          skyMat: {
            fog: app.stage.skyDome.material.fog,
            side: app.stage.skyDome.material.side,
            hasMap: Boolean(app.stage.skyDome.material.map),
            mapImage: app.stage.skyDome.material.map?.image ? { w: app.stage.skyDome.material.map.image.width, h: app.stage.skyDome.material.map.image.height } : null
          }
        };
      })()`,
      returnByValue: true
    });
    console.log('DIAG:', JSON.stringify(diag?.result?.value, null, 2));

    await captureView('environment-overview.png', `(() => {
      window.__capturing = true;
      const app = window.__app;
      if (!app) return;
      app.stage.paused = false;
      app.stage.setDusk(false);
      app.world.setDusk(false);
      document.documentElement.dataset.theme = 'day';
      app.stage.resize();
      document.querySelector('#panel')?.classList.remove('collapsed');
      // Perspective matching visual reference image: looking from South toward North with sky and rolling hills in upper horizon
      app.stage.setView({ x: -10, z: -50, distance: 680, azimuth: 0.03, polar: 1.30 });
      app.stage.renderer.render(app.stage.scene, app.stage.camera);
      app.labels.update();
    })()`);

    // 2. Dusk / Sunset view with streetlights, stadium floodlights and glowing windows
    console.log('Capturing dusk environment view...');
    await captureView('environment-dusk.png', `(() => {
      window.__capturing = true;
      const app = window.__app;
      if (!app) return;
      app.stage.paused = false;
      app.stage.setDusk(true);
      app.world.setDusk(true);
      document.documentElement.dataset.theme = 'dusk';
      app.stage.resize();
      app.stage.setView({ x: -10, z: -50, distance: 680, azimuth: 0.03, polar: 1.30 });
      app.stage.renderer.render(app.stage.scene, app.stage.camera);
      app.labels.update();
    })()`);

    // 3. Top-down view of C-Block area to verify zero regression in geometry
    console.log('Capturing top-down C-block view...');
    await captureView('c-block-topdown.png', `(() => {
      window.__capturing = true;
      const app = window.__app;
      if (!app) return;
      app.stage.paused = false;
      app.stage.setDusk(false);
      app.world.setDusk(false);
      document.documentElement.dataset.theme = 'day';
      app.stage.resize();
      document.querySelector('#panel')?.classList.add('collapsed');
      app.stage.setView({ x: 250, z: 5, distance: 240, azimuth: 0, polar: 0.001 });
      app.stage.renderer.render(app.stage.scene, app.stage.camera);
      app.labels.update();
    })()`);

    ws.close();
    console.log('All screenshots captured successfully!');
  } finally {
    proc.kill('SIGKILL');
  }
}

run().catch((err) => {
  console.error('Error:', err);
  proc.kill('SIGKILL');
  process.exit(1);
});
