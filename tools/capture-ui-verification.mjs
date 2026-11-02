import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9235;
const URL = 'http://127.0.0.1:5173';
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';

const DAY_FULL_PNG = path.join(ARTIFACT_DIR, 'ui-glassmorphism-day-full.png');
const DAY_CLOSEUP_PNG = path.join(ARTIFACT_DIR, 'ui-glassmorphism-day-panel.png');
const DUSK_CLOSEUP_PNG = path.join(ARTIFACT_DIR, 'ui-glassmorphism-dusk-panel.png');

console.log('Launching headless Chrome for UI glassmorphism and dialog verification...');
const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--window-size=1440,960',
  '--user-data-dir=/tmp/cu-nav-ui-profile',
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
      width: 1440,
      height: 960,
      deviceScaleFactor: 2,
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

    // Select Gate 2 to display the dialog card exactly like user screenshot
    console.log('Selecting Gate 2 to display dialog card...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const app = window.__app;
        if (!app) return;
        // Select Gate 2
        app.selectPlace('gate-2', true);
        app.stage.setView({ x: 300, z: -100, distance: 380, azimuth: 0.45, polar: 0.85 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
        app.labels.update();
      })()`
    });
    await sleep(1500);

    // Full screen capture in day mode
    const shotFull = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(DAY_FULL_PNG, Buffer.from(shotFull.data, 'base64'));
    console.log('Saved Day mode full shot:', DAY_FULL_PNG);

    // Capture panel closeup (clip around #panel)
    const panelBox = await send('Runtime.evaluate', {
      expression: `(() => {
        const p = document.querySelector('#panel');
        if (!p) return null;
        const rect = p.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      })()`,
      returnByValue: true
    });

    if (panelBox?.result?.value) {
      const box = panelBox.result.value;
      const shotPanelDay = await send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: Math.max(0, box.x - 20),
          y: Math.max(0, box.y - 20),
          width: box.width + 60,
          height: box.height + 40,
          scale: 1
        }
      });
      fs.writeFileSync(DAY_CLOSEUP_PNG, Buffer.from(shotPanelDay.data, 'base64'));
      console.log('Saved Day mode panel closeup:', DAY_CLOSEUP_PNG);
    }

    // Toggle dusk mode
    console.log('Toggling Dusk / Dark mode...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        document.querySelector('#themeBtn')?.click();
      })()`
    });
    await sleep(800);

    if (panelBox?.result?.value) {
      const box = panelBox.result.value;
      const shotPanelDusk = await send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: Math.max(0, box.x - 20),
          y: Math.max(0, box.y - 20),
          width: box.width + 60,
          height: box.height + 40,
          scale: 1
        }
      });
      fs.writeFileSync(DUSK_CLOSEUP_PNG, Buffer.from(shotPanelDusk.data, 'base64'));
      console.log('Saved Dusk mode panel closeup:', DUSK_CLOSEUP_PNG);
    }

    ws.close();
  } catch (err) {
    console.error('Capture error:', err);
  } finally {
    try { proc.kill(); } catch (e) {}
    process.exit(0);
  }
}

run();
