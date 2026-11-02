import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9245;
const URL = 'http://127.0.0.1:5173';
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';

const DAY_PANEL_PNG = path.join(ARTIFACT_DIR, 'ui-glassmorphism-day-panel.png');
const DUSK_PANEL_PNG = path.join(ARTIFACT_DIR, 'ui-glassmorphism-dusk-panel.png');
const DAY_SIGN_PNG = path.join(ARTIFACT_DIR, 'b1-cu-signage-day.png');
const DUSK_SIGN_PNG = path.join(ARTIFACT_DIR, 'b1-cu-signage-dusk.png');
const DAY_FULL_PNG = path.join(ARTIFACT_DIR, 'ui-glassmorphism-day-full.png');

console.log('Launching headless Chrome for comprehensive UI and 3D signage verification...');
const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--window-size=1440,960',
  '--user-data-dir=/tmp/cu-nav-final-' + Date.now(),
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

    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
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

    console.log('App ready. Setting initial viewpoint for UI panel inspection...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const app = window.__app;
        if (!app) return;
        // Select Gate 2 to show landmark details card and test close button layout
        app.selectPlace('gate-2', true);
        app.stage.setView({ x: 190, z: -100, distance: 420, azimuth: 0.35, polar: 1.0 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
        app.labels.update();
      })()`
    });
    await sleep(1200);

    // 1. Day Mode Full Screen & Panel Closeup
    const shotDayFull = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(DAY_FULL_PNG, Buffer.from(shotDayFull.data, 'base64'));
    console.log('Saved Day full screen:', DAY_FULL_PNG);

    const panelBoxRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const p = document.querySelector('#panel');
        if (!p) return null;
        const rect = p.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      })()`,
      returnByValue: true
    });

    if (panelBoxRes?.result?.value) {
      const box = panelBoxRes.result.value;
      const shotDayPanel = await send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: Math.max(0, box.x - 16),
          y: Math.max(0, box.y - 16),
          width: box.width + 50,
          height: box.height + 32,
          scale: 1
        }
      });
      fs.writeFileSync(DAY_PANEL_PNG, Buffer.from(shotDayPanel.data, 'base64'));
      console.log('Saved Day panel closeup:', DAY_PANEL_PNG);
    }

    // 2. Dusk Mode Panel Closeup
    console.log('Switching to Dusk mode...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        if (!document.documentElement.dataset.theme) {
          document.querySelector('#themeBtn')?.click();
        }
      })()`
    });
    await sleep(800);

    if (panelBoxRes?.result?.value) {
      const box = panelBoxRes.result.value;
      const shotDuskPanel = await send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: Math.max(0, box.x - 16),
          y: Math.max(0, box.y - 16),
          width: box.width + 50,
          height: box.height + 32,
          scale: 1
        }
      });
      fs.writeFileSync(DUSK_PANEL_PNG, Buffer.from(shotDuskPanel.data, 'base64'));
      console.log('Saved Dusk panel closeup:', DUSK_PANEL_PNG);
    }

    // 3. B1 Block Chandigarh University Signage - Dusk view
    console.log('Focusing 3D camera on B1 Chandigarh University Signage (Dusk)...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const app = window.__app;
        if (!app) return;
        // Close place card and temporarily hide 2D overlay labels and panel for clean architectural capture
        app.selectPlace(null);
        document.getElementById('labels').style.display = 'none';
        document.getElementById('panel').style.display = 'none';
        document.querySelectorAll('.stage-hud, .side-dock').forEach(el => el.style.display = 'none');
        
        // Position camera to look directly at B1 northern facade from the Ludhiana-Chandigarh highway approach
        app.stage.setView({ x: 190, z: -179.8, distance: 82, azimuth: Math.PI + 0.04, polar: 1.36 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
      })()`
    });
    await sleep(1000);

    const shotSignDusk = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(DUSK_SIGN_PNG, Buffer.from(shotSignDusk.data, 'base64'));
    console.log('Saved B1 Signage Dusk shot:', DUSK_SIGN_PNG);

    // 4. B1 Block Chandigarh University Signage - Day view
    console.log('Switching back to Day mode for B1 Signage (Daylight)...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const app = window.__app;
        if (!app) return;
        if (document.documentElement.dataset.theme === 'dusk') {
          document.querySelector('#themeBtn')?.click();
        }
        app.stage.setView({ x: 190, z: -179.8, distance: 82, azimuth: Math.PI + 0.04, polar: 1.36 });
        app.stage.renderer.render(app.stage.scene, app.stage.camera);
      })()`
    });
    await sleep(1000);

    const shotSignDay = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(DAY_SIGN_PNG, Buffer.from(shotSignDay.data, 'base64'));
    console.log('Saved B1 Signage Day shot:', DAY_SIGN_PNG);

    // Restore UI overlays
    await send('Runtime.evaluate', {
      expression: `(() => {
        document.getElementById('labels').style.display = '';
        document.getElementById('panel').style.display = '';
        document.querySelectorAll('.stage-hud, .side-dock').forEach(el => el.style.display = '');
      })()`
    });

    ws.close();
  } catch (err) {
    console.error('Capture error:', err);
  } finally {
    try { proc.kill(); } catch (e) {}
    process.exit(0);
  }
}

run();
