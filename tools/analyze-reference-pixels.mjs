import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9227;

const html = `<!DOCTYPE html>
<html>
<body>
<img id="img" src="file:///Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c/.user_uploaded/media_1793470159928_273828b0.jpg" />
<canvas id="cvs"></canvas>
</body>
</html>`;

fs.writeFileSync('/tmp/img-analyze.html', html);

const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/cu-analyze-profile',
  'file:///tmp/img-analyze.html'
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
  await sleep(600);

  // Evaluate image dimensions and check key landmark pixels
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const img = document.getElementById('img');
      return { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
    })()`,
    returnByValue: true
  });

  console.log('Image dimensions:', r.result.value);
  ws.close();
  proc.kill();
}

run().catch(e => { console.error(e); proc.kill(); process.exit(1); });
