import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9226;
const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';
const SVG_PATH = path.join(ARTIFACT_DIR, 'd-block-preview.svg');
const PNG_PATH = path.join(ARTIFACT_DIR, 'd-block-preview.png');
const DOCS_PNG = path.join('docs/screenshots', 'd-block-preview.png');

const svgContent = fs.readFileSync(SVG_PATH, 'utf8');
const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef3eb;display:flex;align-items:center;justify-content:center;">${svgContent}</body></html>`;
const htmlPath = '/tmp/preview-d-block.html';
fs.writeFileSync(htmlPath, html);

const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--window-size=1200,1080',
  '--user-data-dir=/tmp/cu-nav-d-block-profile',
  `file://${htmlPath}`
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  try {
    let target = null;
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        const list = await res.json();
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (target) break;
      } catch (e) {}
    }
    if (!target) throw new Error('Target not found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let msgId = 0;
    const send = (method, params = {}) => new Promise((res) => {
      const id = ++msgId;
      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === id) { ws.removeEventListener('message', handler); res(data.result); }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1080, deviceScaleFactor: 1, mobile: false });
    await sleep(500);

    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1200, height: 1080, scale: 1 } });
    const buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(PNG_PATH, buf);
    if (!fs.existsSync('docs/screenshots')) fs.mkdirSync('docs/screenshots', { recursive: true });
    fs.writeFileSync(DOCS_PNG, buf);
    console.log(`Saved PNG: ${PNG_PATH} (${buf.length} bytes)`);

    ws.close();
  } finally {
    proc.kill();
  }
}

run().catch((e) => {
  console.error(e);
  proc.kill();
  process.exit(1);
});
