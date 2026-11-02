import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9229;

// Script to plot the extracted landmark points on top of the reference image
// to visually confirm their exact registration!
const landmarks = [
  { name: 'Gate 3', u: 428, v: 154 },
  { name: 'Gobind', u: 320, v: 184 },
  { name: 'TB1', u: 320, v: 218 },
  { name: 'D8', u: 350, v: 248 },
  { name: 'DD1', u: 160, v: 212 },
  { name: 'DD2', u: 175, v: 262 },
  { name: 'D1 North', u: 345, v: 388 },
  { name: 'D1 West', u: 260, v: 386 },
  { name: 'D2', u: 408, v: 404 },
  { name: 'D3', u: 372, v: 442 },
  { name: 'D4', u: 348, v: 494 },
  { name: 'D5', u: 244, v: 446 },
  { name: 'D6 (Star)', u: 178, v: 426 },
  { name: 'D7', u: 202, v: 378 },
  { name: 'Shivalik', u: 134, v: 456 },
  { name: 'Gate 7', u: 386, v: 564 },
  { name: 'Gate 8', u: 124, v: 610 },
  { name: 'Sports Complex', u: 160, v: 692 },
  { name: 'B5', u: 504, v: 512 },
  { name: 'LC Hostel', u: 642, v: 462 },
  { name: 'B4', u: 742, v: 586 },
  { name: 'Gate 4', u: 728, v: 822 },
  { name: 'Boys Hostel', u: 664, v: 938 }
];

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
    const pts = ${JSON.stringify(landmarks)};
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.u, p.v, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#06b6d4';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.fillText(p.name, p.u + 9, p.v + 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(p.name, p.u + 8, p.v + 3);
    }
  };
</script>
</body>
</html>`;

fs.writeFileSync('/tmp/landmarks-plot.html', html);

const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--window-size=764,1024',
  '--user-data-dir=/tmp/cu-landmark-profile',
  'file:///tmp/landmarks-plot.html'
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
  fs.writeFileSync('/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c/reference-landmarks-check.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved reference-landmarks-check.png');

  ws.close();
  proc.kill();
}

run().catch(e => { console.error(e); proc.kill(); process.exit(1); });
