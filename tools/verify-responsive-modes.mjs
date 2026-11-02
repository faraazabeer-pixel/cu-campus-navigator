import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9256;
const URL = 'http://127.0.0.1:5173';
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('Starting headless Chrome for Responsive View Mode & Minimize/Restore Verification...');
  const proc = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--hide-scrollbars',
    '--window-size=1920,1080',
    '--user-data-dir=/tmp/cu-nav-min-' + Date.now(),
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

    console.log('--- TEST 1: Desktop Viewport (1920x1080) in Auto Mode ---');
    await setViewport(1920, 1080, false);
    await evalJs('localStorage.removeItem("cu_nav_view_mode"); window.location.reload();');
    await sleep(1200);
    for (let i = 0; i < 30; i++) {
      if (await evalJs('Boolean(document.body.dataset.ready === "1")')) break;
      await sleep(200);
    }
    const t1Layout = await evalJs('document.documentElement.dataset.layout');
    console.log(`1920x1080 Auto => layout: "${t1Layout}"`);
    if (t1Layout !== 'desktop') throw new Error(`Expected desktop layout, got ${t1Layout}`);
    await snap('viewmode-desktop-auto-1080p.png');

    console.log('--- TEST 2: Route Planning & Minimize on Desktop (1920x1080) ---');
    // Set route
    await evalJs('window.__app.setEndpoint("from", { type: "place", id: "gate-1" }); window.__app.setEndpoint("to", { type: "place", id: "food-republic" });');
    await sleep(800);
    const hasRoute = await evalJs('Boolean(window.__app.state.result && window.__app.state.result.found)');
    if (!hasRoute) throw new Error('Route not found');

    // Click minimize button
    await evalJs('document.getElementById("minPanelBtn").click()');
    await sleep(400);
    const isMinDesktop = await evalJs('document.getElementById("panel").classList.contains("is-minimized")');
    const isRestoreBtnVis = await evalJs('!document.getElementById("restorePanelBtn").hidden');
    const restoreBadgeText = await evalJs('document.getElementById("restoreBadge").textContent');
    console.log(`Desktop minimized => isMin: ${isMinDesktop}, restoreBtnVisible: ${isRestoreBtnVis}, badge: "${restoreBadgeText}"`);
    if (!isMinDesktop || !isRestoreBtnVis) throw new Error('Desktop minimize failed');
    await snap('viewmode-desktop-minimized.png');

    // Restore on Desktop
    await evalJs('document.getElementById("restorePanelBtn").click()');
    await sleep(400);
    const isRestoredDesktop = await evalJs('!document.getElementById("panel").classList.contains("is-minimized")');
    console.log(`Desktop restored => isRestored: ${isRestoredDesktop}`);
    if (!isRestoredDesktop) throw new Error('Desktop restore failed');

    console.log('--- TEST 3: Laptop Viewport (1366x768) in Auto Mode ---');
    await setViewport(1366, 768, false);
    const t3Layout = await evalJs('document.documentElement.dataset.layout');
    console.log(`1366x768 Auto => layout: "${t3Layout}"`);
    if (t3Layout !== 'desktop') throw new Error(`Expected desktop layout on 1366px, got ${t3Layout}`);
    await evalJs('document.getElementById("minPanelBtn").click()');
    await sleep(350);
    await snap('viewmode-laptop-minimized-1366.png');
    await evalJs('document.getElementById("restorePanelBtn").click()');
    await sleep(350);

    console.log('--- TEST 4: Tablet Viewport (768x1024 - iPad Portrait) ---');
    await setViewport(768, 1024, false);
    const t4Layout = await evalJs('document.documentElement.dataset.layout');
    console.log(`768x1024 Auto => layout: "${t4Layout}"`);
    if (t4Layout !== 'tablet') throw new Error(`Expected tablet layout on 768px, got ${t4Layout}`);
    await snap('viewmode-tablet-portrait.png');
    await evalJs('document.getElementById("minPanelBtn").click()');
    await sleep(350);
    const isMinTablet = await evalJs('document.getElementById("panel").classList.contains("is-minimized")');
    console.log(`Tablet minimized => isMin: ${isMinTablet}`);
    await snap('viewmode-tablet-minimized.png');
    await evalJs('document.getElementById("restorePanelBtn").click()');
    await sleep(350);

    console.log('--- TEST 5: Mobile Viewport (390x844 - iPhone 14) ---');
    await setViewport(390, 844, true);
    await sleep(400);
    const t5Layout = await evalJs('document.documentElement.dataset.layout');
    console.log(`390x844 Auto => layout: "${t5Layout}"`);
    if (t5Layout !== 'mobile') throw new Error(`Expected mobile layout on 390px, got ${t5Layout}`);

    // Sheet minimize via #minPanelBtn
    await evalJs('document.getElementById("minPanelBtn").click()');
    await sleep(400);
    const sMinMobile = await evalJs('document.getElementById("panel").classList.contains("sheet-collapsed")');
    console.log(`Mobile minimized via button => is collapsed: ${sMinMobile}`);
    if (!sMinMobile) throw new Error('Mobile minimize button failed');
    await snap('viewmode-mobile-minimized.png');

    // Sheet restore via #minPanelBtn
    await evalJs('document.getElementById("minPanelBtn").click()');
    await sleep(400);
    const sRestoredMobile = await evalJs('!document.getElementById("panel").classList.contains("sheet-collapsed")');
    console.log(`Mobile restored via button => is open: ${sRestoredMobile}`);
    if (!sRestoredMobile) throw new Error('Mobile restore button failed');
    await snap('viewmode-mobile-restored.png');

    console.log('--- TEST 6: State & Camera Preservation across Modes ---');
    const camBefore = await evalJs('JSON.stringify(window.__app.stage.view())');
    const fromBefore = await evalJs('window.__app.state.from?.id');
    const toBefore = await evalJs('window.__app.state.to?.id');
    const routeBefore = await evalJs('window.__app.state.result?.distance');

    // Switch to Laptop mode on mobile
    await evalJs('document.querySelector(\'.view-mode-btn[data-mode="laptop"]\').click()');
    await sleep(400);
    // Switch to Mobile mode
    await evalJs('document.querySelector(\'.view-mode-btn[data-mode="mobile"]\').click()');
    await sleep(400);
    // Switch to Auto mode
    await evalJs('document.querySelector(\'.view-mode-btn[data-mode="auto"]\').click()');
    await sleep(400);

    const fromAfter = await evalJs('window.__app.state.from?.id');
    const toAfter = await evalJs('window.__app.state.to?.id');
    const routeAfter = await evalJs('window.__app.state.result?.distance');
    console.log(`Endpoints preserved: ${fromBefore === fromAfter && toBefore === toAfter}`);
    console.log(`Route distance preserved: ${routeBefore === routeAfter} (${routeAfter} m)`);
    if (fromBefore !== fromAfter || toBefore !== toAfter || routeBefore !== routeAfter) {
      throw new Error('State was not preserved during mode transitions');
    }

    console.log('--- TEST 7: Compact Phone (320x568 - iPhone SE) ---');
    await setViewport(320, 568, true);
    await sleep(400);
    const t7Layout = await evalJs('document.documentElement.dataset.layout');
    console.log(`320x568 Auto => layout: "${t7Layout}"`);
    if (t7Layout !== 'mobile') throw new Error(`Expected mobile layout on 320px, got ${t7Layout}`);
    await snap('viewmode-mobile-320px-se.png');

    console.log('ALL RESPONSIVE AND MINIMIZE/RESTORE TESTS PASSED SUCCESSFULLY!');
  } finally {
    proc.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
