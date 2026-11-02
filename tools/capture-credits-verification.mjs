import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9260;
const URL = 'http://127.0.0.1:5173';
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('Capturing Data Accuracy Details with Project Credits Footer...');
  const proc = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--hide-scrollbars',
    '--window-size=1920,1080',
    '--user-data-dir=/tmp/cu-nav-credits-' + Date.now(),
    URL
  ], { stdio: 'ignore' });

  try {
    let target = null;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        const list = await res.json();
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (target) break;
      } catch {}
    }
    if (!target) throw new Error('Chrome target not found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let msgId = 0;
    const send = (method, params = {}) => new Promise((resolve) => {
      const id = ++msgId;
      const handler = (evt) => {
        const d = JSON.parse(evt.data);
        if (d.id === id) {
          ws.removeEventListener('message', handler);
          resolve(d.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Network.enable');
    await send('Page.enable');

    const evalJs = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return r?.result?.value;
    };

    // Wait until app is ready
    for (let i = 0; i < 40; i++) {
      const ready = await evalJs('Boolean(document.body.dataset.ready === "1" && window.__app && window.__app.stage)');
      if (ready) break;
      await sleep(250);
    }
    await sleep(500);

    const setViewport = async (w, h, isMobile = false) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: 2,
        mobile: isMobile
      });
      await evalJs('window.dispatchEvent(new Event("resize"))');
      await sleep(350);
    };

    const snap = async (filename) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const outPath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
      console.log(`Saved screenshot: ${filename}`);
      return outPath;
    };

    // 1. Desktop Dialog
    await setViewport(1920, 1080, false);
    await evalJs('document.getElementById("dataBanner").click();');
    await sleep(400);
    // Scroll dialog to bottom to view credits
    await evalJs('document.getElementById("dataContent").scrollTop = document.getElementById("dataContent").scrollHeight;');
    await sleep(300);
    await snap('credits-dialog-desktop.png');

    // Close dialog
    await evalJs('document.getElementById("dataDialog").close();');
    await sleep(300);

    // 2. Mobile Dialog (390x844)
    await setViewport(390, 844, true);
    await sleep(400);
    await evalJs('document.getElementById("dataBanner").click();');
    await sleep(400);
    // Scroll dialog to bottom to view credits
    await evalJs('document.getElementById("dataContent").scrollTop = document.getElementById("dataContent").scrollHeight;');
    await sleep(300);
    await snap('credits-dialog-mobile.png');

    console.log('CREDITS DIALOG VERIFICATION COMPLETE!');
  } finally {
    proc.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error('CAPTURING FAILED:', err);
  process.exit(1);
});
