import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9228;

// Create HTML that draws coordinate grid with pixel markings every 50px over the original hand-drawn map
const html = `<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; padding: 0; background: #000; overflow: hidden; }
  #wrap { position: relative; width: 764px; height: 1024px; }
  img { position: absolute; left: 0; top: 0; width: 764px; height: 1024px; }
  canvas { position: absolute; left: 0; top: 0; width: 764px; height: 1024px; }
</style>
</head>
<body>
<div id="wrap">
  <img id="img" src="file:///Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c/.user_uploaded/media_1793470159928_273828b0.jpg" />
  <canvas id="cvs" width="764" height="1024"></canvas>
</div>
<script>
  window.onload = () => {
    const cvs = document.getElementById('cvs');
    const ctx = cvs.getContext('2d');
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.font = '10px monospace';
    for (let x = 0; x <= 764; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke();
      ctx.fillText(x, x + 2, 12);
      ctx.fillText(x, x + 2, 1020);
    }
    for (let y = 0; y <= 1024; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(764, y); ctx.stroke();
      ctx.fillText(y, 4, y - 2);
      ctx.fillText(y, 730, y - 2);
    }
    document.body.dataset.ready = '1';
  };
</script>
</body>
</html>`;

fs.writeFileSync('/tmp/grid-analyze.html', html);

const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--window-size=764,1024',
  '--user-data-dir=/tmp/cu-grid-profile',
  'file:///tmp/grid-analyze.html'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  let target = null;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch (e) {}
  }
  if (!target) throw new Error('Target not found');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const send = (method, params = {}) => new Promise(resolve => {
    const id = ++msgId;
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === id) { ws.removeEventListener('message', handler); resolve(data.result); }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 764, height: 1024, deviceScaleFactor: 1, mobile: false });
  await sleep(600);

  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 764, height: 1024, scale: 1 } });
  fs.writeFileSync('/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c/reference-with-grid.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved reference-with-grid.png');

  ws.close();
  proc.kill();
}

run().catch(e => { console.error(e); proc.kill(); process.exit(1); });
