import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9246;
const URL = 'http://127.0.0.1:5173';
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';

const DAY_DROPDOWN_PNG = path.join(ARTIFACT_DIR, 'search-dropdown-day-verified.png');
const DUSK_DROPDOWN_PNG = path.join(ARTIFACT_DIR, 'search-dropdown-dusk-verified.png');

console.log('Launching headless Chrome to test search dropdown visibility...');
const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--window-size=1440,960',
  '--user-data-dir=/tmp/cu-nav-dropdown-' + Date.now(),
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

    console.log('App ready. Triggering search dropdown on start input...');
    // Focus and type in #fromInput to trigger suggest dropdown matching user's screenshot
    await send('Runtime.evaluate', {
      expression: `(() => {
        const input = document.querySelector('#fromInput');
        if (!input) return;
        input.focus();
        // Trigger suggest with 'A' query like user screenshot
        input.value = 'A';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`
    });
    await sleep(600);

    // Capture dropdown in Day mode (clip around #panel and #suggest)
    const panelBoxRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const p = document.querySelector('#panel');
        if (!p) return null;
        const rect = p.getBoundingClientRect();
        const s = document.querySelector('#suggest');
        const sRect = s && !s.hidden ? s.getBoundingClientRect() : rect;
        const bottom = Math.max(rect.bottom, sRect.bottom);
        return { x: rect.left, y: rect.top, width: rect.width, height: bottom - rect.top };
      })()`,
      returnByValue: true
    });

    if (panelBoxRes?.result?.value) {
      const box = panelBoxRes.result.value;
      const shotDay = await send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: Math.max(0, box.x - 16),
          y: Math.max(0, box.y - 16),
          width: box.width + 40,
          height: box.height + 40,
          scale: 1
        }
      });
      fs.writeFileSync(DAY_DROPDOWN_PNG, Buffer.from(shotDay.data, 'base64'));
      console.log('Saved Day dropdown shot:', DAY_DROPDOWN_PNG);
    }

    // Toggle Dusk mode
    console.log('Switching to Dusk mode...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        document.querySelector('#themeBtn')?.click();
      })()`
    });
    await sleep(600);

    if (panelBoxRes?.result?.value) {
      const box = panelBoxRes.result.value;
      const shotDusk = await send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: Math.max(0, box.x - 16),
          y: Math.max(0, box.y - 16),
          width: box.width + 40,
          height: box.height + 40,
          scale: 1
        }
      });
      fs.writeFileSync(DUSK_DROPDOWN_PNG, Buffer.from(shotDusk.data, 'base64'));
      console.log('Saved Dusk dropdown shot:', DUSK_DROPDOWN_PNG);
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
