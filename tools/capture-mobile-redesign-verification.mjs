import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9265;
const URL = 'http://127.0.0.1:5173';
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('Capturing Mobile Redesign & Desktop Regression Screenshots...');
  const proc = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--hide-scrollbars',
    '--window-size=1920,1080',
    '--user-data-dir=/tmp/cu-nav-mobile-' + Date.now(),
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
    for (let i = 0; i < 50; i++) {
      const ready = await evalJs('Boolean(document.body.dataset.ready === "1" && window.__app && window.__app.stage)');
      if (ready) break;
      await sleep(250);
    }
    await sleep(600);

    const setViewport = async (w, h, isMobile = false) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: 2,
        mobile: isMobile
      });
      await evalJs('window.dispatchEvent(new Event("resize"))');
      await sleep(400);
    };

    const snap = async (filename) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const outPath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
      console.log(`Saved screenshot: ${filename}`);
      return outPath;
    };

    // Helper to setup a route between A1 Biotech and D6 Library
    const setupTestRoute = async () => {
      await evalJs(`
        window.__app.setEndpoint('from', { type: 'place', id: 'a1-biotech' }, { route: false });
        window.__app.setEndpoint('to', { type: 'place', id: 'd6-library' }, { route: true });
      `);
      await sleep(600);
    };

    // -------------------------------------------------------------
    // 1. Mobile Phone 390x844 (iPhone 12/13/14) - Route Planning (Image 2 mockup match)
    // -------------------------------------------------------------
    console.log('1. Capturing Mobile 390x844 Planning State...');
    await setViewport(390, 844, true);
    await setupTestRoute();
    await evalJs('window.__app.setMobileView("plan");');
    await sleep(500);
    await snap('mobile-plan-390x844.png');

    // -------------------------------------------------------------
    // 2. Mobile Phone 390x844 - Route Preview State (Image 1 mockup match)
    // -------------------------------------------------------------
    console.log('2. Capturing Mobile 390x844 Preview State...');
    await evalJs('document.getElementById("mobilePreviewWalkBtn").click();');
    await sleep(600);
    await snap('mobile-preview-390x844.png');

    // -------------------------------------------------------------
    // 3. Mobile Phone 390x844 - Settings Popover
    // -------------------------------------------------------------
    console.log('3. Capturing Mobile 390x844 Settings Popover...');
    await evalJs('window.__app.setMobileView("plan");');
    await sleep(300);
    await evalJs('document.getElementById("mobileSettingsBtn").click();');
    await sleep(400);
    await snap('mobile-settings-popover-390x844.png');
    // Close popover
    await evalJs('document.getElementById("mobileSettingsClose").click();');
    await sleep(300);

    // -------------------------------------------------------------
    // 4. Mobile 320x568 (iPhone SE)
    // -------------------------------------------------------------
    console.log('4. Capturing Mobile 320x568 (iPhone SE)...');
    await setViewport(320, 568, true);
    await sleep(400);
    await snap('mobile-plan-320x568.png');

    // -------------------------------------------------------------
    // 5. Mobile 375x667 (iPhone 8) - Route Preview State
    // -------------------------------------------------------------
    console.log('5. Capturing Mobile 375x667 (iPhone 8) Preview...');
    await setViewport(375, 667, true);
    await evalJs('window.__app.setMobileView("preview");');
    await sleep(400);
    await snap('mobile-preview-375x667.png');

    // -------------------------------------------------------------
    // 6. Mobile 430x932 (iPhone 14/15 Pro Max)
    // -------------------------------------------------------------
    console.log('6. Capturing Mobile 430x932 (Pro Max)...');
    await setViewport(430, 932, true);
    await evalJs('window.__app.setMobileView("plan");');
    await sleep(400);
    await snap('mobile-plan-430x932.png');

    // -------------------------------------------------------------
    // 7. Tablet Regression Check: 768x1024 Portrait
    // -------------------------------------------------------------
    console.log('7. Capturing Tablet Regression (768x1024)...');
    await setViewport(768, 1024, false);
    // Switch to auto mode so it detects tablet width
    await evalJs('document.querySelector(".view-mode-btn[data-mode=\\"auto\\"]").click();');
    await sleep(500);
    await snap('tablet-regression-768x1024.png');

    // -------------------------------------------------------------
    // 8. Laptop Regression Check: 1366x768
    // -------------------------------------------------------------
    console.log('8. Capturing Laptop Regression (1366x768)...');
    await setViewport(1366, 768, false);
    await sleep(500);
    await snap('laptop-regression-1366x768.png');

    // -------------------------------------------------------------
    // 9. Desktop Regression Check: 1920x1080 (1080p)
    // -------------------------------------------------------------
    console.log('9. Capturing Desktop Regression (1920x1080)...');
    await setViewport(1920, 1080, false);
    await sleep(500);
    await snap('desktop-regression-1920x1080.png');

    console.log('ALL VERIFICATION SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } finally {
    proc.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
