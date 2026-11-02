// Browser end-to-end test (Playwright + headless Chromium with software WebGL).
// Verifies the real UI: 3D scene renders, search -> route -> directions, step focus, pick-on-map,
// profile switch, fly-through, layers, data dialog, mobile layout. Also writes docs/screenshots/*.png.
// Run: npm run test:e2e   (needs `npx playwright install chromium` or a system Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createServer } from '../server/server.mjs';
import { ROOT } from './helpers.mjs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const resolve of [() => require('playwright'), () => require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))]) { try { return resolve(); } catch { /* try next */ } }
  return null;
}
const pw = loadPlaywright();
if (!pw) { console.log('SKIP e2e: Playwright is not installed (npm i -D playwright && npx playwright install chromium)'); process.exit(0); }

const shots = path.join(ROOT, 'docs', 'screenshots'); fs.mkdirSync(shots, { recursive: true });
const srv = await createServer({ port: 0, log: false });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const idle = (pg) => pg.waitForFunction(() => !window.__app.stage.tween, null, { timeout: 60000 });
const step = async (name, fn) => { try { await fn(); console.log('  ok  ', name); } catch (e) { failed++; console.log('  FAIL', name, '\n      ', e.message.split('\n')[0]); } };

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); page.setDefaultTimeout(120000);
  const problems = []; page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));
  await page.goto(srv.url, { waitUntil: 'load' });
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 90000 });
  await page.waitForTimeout(1500);

  await step('3D scene renders non-trivial pixels', async () => {
    const colors = await page.evaluate(() => { const { stage } = window.__app; stage.renderer.render(stage.scene, stage.camera); const c = document.createElement('canvas'); c.width = 200; c.height = 120; const x = c.getContext('2d'); x.drawImage(stage.canvas, 0, 0, 200, 120); const d = x.getImageData(0, 0, 200, 120).data; const s = new Set(); for (let i = 0; i < d.length; i += 16) s.add((d[i] >> 3) * 1024 + (d[i + 1] >> 3) * 32 + (d[i + 2] >> 3)); return s.size; });
    assert.ok(colors > 40, `only ${colors} distinct colours`);
  });
  await step('scene contains all places, labels and graph data', async () => {
    const r = await page.evaluate(() => { const a = window.__app; return { places: a.campus.places.length, objs: a.world.placeObjects.size, labels: document.querySelectorAll('.lbl').length, visible: [...document.querySelectorAll('.lbl')].filter((l) => l.style.visibility === 'visible').length }; });
    assert.equal(r.objs, r.places); assert.equal(r.labels, r.places); assert.ok(r.visible >= 5, `visible labels ${r.visible}`);
  });
  await page.screenshot({ path: path.join(shots, '01-overview.png') });

  await step('search: type, keyboard-select start and destination -> route computed by C++ engine', async () => {
    await page.fill('#fromInput', 'main gate'); await page.waitForSelector('#suggest li[role=option]'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.fill('#toInput', 'd6 lib'); await page.waitForSelector('#suggest li[role=option]'); await page.keyboard.press('Enter');
    await page.waitForSelector('#result:not([hidden])', { timeout: 15000 });
    assert.equal(await page.inputValue('#fromInput'), 'Gate 1 (Main Gate)'); assert.match(await page.inputValue('#toInput'), /D6 Library/);
    assert.match(await page.textContent('#distBig'), /^\d+(\.\d+)? (m|km)$/); assert.match(await page.textContent('#engineNote'), /C\+\+ Dijkstra/);
    assert.ok((await page.$$('#steps li')).length >= 4); assert.match(page.url(), /from=gate-1&to=d6-library/);
    const g = await page.evaluate(() => window.__app.routeView.group.visible && window.__app.routeView.total); assert.ok(g > 300, 'route ribbon shown');
  });
  await page.waitForTimeout(1600); await page.screenshot({ path: path.join(shots, '02-route.png') });

  await step('distance shown equals the API result', async () => {
    const api = await (await fetch(`${srv.url}/api/route?from=gate-1&to=d6-library`)).json();
    const shown = await page.textContent('#distBig'); assert.equal(shown, api.distance >= 1000 ? `${(api.distance / 1000).toFixed(2)} km` : `${Math.round(api.distance)} m`);
  });
  await step('clicking a step flies the camera to it', async () => {
    const [sx, sz] = await page.evaluate(() => window.__app.state.result.steps[2].at);
    await page.click('#steps li:nth-child(3)'); await page.waitForTimeout(100); await idle(page);
    const v = await page.evaluate(() => window.__app.stage.view()); assert.ok(Math.hypot(v.x - sx, v.z - sz) < 5, `camera at ${v.x},${v.z} vs step ${sx},${sz}`); assert.ok(v.distance < 200);
  });
  await page.screenshot({ path: path.join(shots, '03-step-focus.png') });

  await step('step-free profile re-routes', async () => { await page.click('[data-profile=accessible]'); await page.waitForFunction(() => /step-free/.test(document.querySelector('#timeBig').textContent)); });
  await step('preview walk (fly-through) starts and can be stopped', async () => {
    await page.click('#flyBtn'); await page.waitForTimeout(800); assert.equal(await page.evaluate(() => window.__app.routeView.flying), true);
    await page.screenshot({ path: path.join(shots, '04-flythrough.png') });
    await page.click('#flyBtn'); await page.waitForTimeout(200); assert.equal(await page.evaluate(() => window.__app.routeView.flying), false);
  });
  await step('swap start/destination', async () => { await page.click('#swapBtn'); await page.waitForFunction(() => document.querySelector('#fromInput').value.startsWith('D6')); });
  await step('pick a destination on the map', async () => {
    await page.click('#clearBtn'); await page.fill('#fromInput', 'gate 2'); await page.keyboard.press('Enter');
    await page.click('[data-pick=to]'); assert.ok(await page.evaluate(() => document.body.classList.contains('picking')));
    await page.evaluate(() => window.__app.stage.setView({ x: 150, z: 160, distance: 400, azimuth: 0, polar: 0.6 })); await page.waitForTimeout(300);
    await page.mouse.click(760, 480); await page.waitForSelector('#result:not([hidden])', { timeout: 15000 });
    assert.ok(/Map point|\(/.test(await page.inputValue('#toInput')) || (await page.inputValue('#toInput')).length > 0);
  });
  await step('clicking a building selects it and shows its data-confidence tags', async () => {
    await page.click('#clearBtn'); await page.evaluate(() => { const { stage, world } = window.__app; const p = world.placeObjects.get('kalpana-chawla-block').userData; stage.setView({ x: 60, z: 225, distance: 260, azimuth: 0, polar: 0.9 }); });
    await page.waitForTimeout(500);
    const pos = await page.evaluate(() => { const { stage } = window.__app; const q = stage.project(60, 12, 225); return [q.x, q.y]; });
    await page.mouse.click(pos[0], pos[1]); await page.waitForSelector('#info:not([hidden])');
    assert.match(await page.textContent('#info'), /Kalpana Chawla Block/); assert.match(await page.textContent('#info'), /confirmed|Name confirmed/); assert.match(await page.textContent('#info'), /Position estimated/);
  });
  await step('layers toggle (routing graph overlay)', async () => { await page.click('[data-layer=graph]'); assert.equal(await page.evaluate(() => window.__app.world.layers.graph.visible), true); await page.screenshot({ path: path.join(shots, '05-graph-overlay.png') }); await page.click('[data-layer=graph]'); });
  await step('2D top view and dusk lighting', async () => {
    await page.$eval('#viewTop', e => e.click()); await page.waitForTimeout(100); await idle(page); assert.ok((await page.evaluate(() => window.__app.stage.view().polar)) < 0.05); await page.screenshot({ path: path.join(shots, '06-top-view.png') });
    await page.$eval('#view3d', e => e.click()); await page.$eval('#themeBtn', e => e.click()); await page.evaluate(() => window.__app.stage.setView({ x: -40, z: 100, distance: 380, azimuth: 0.3, polar: 1.0 })); await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(shots, '07-dusk.png') }); await page.$eval('#themeBtn', e => e.click());
  });
  await step('data-quality dialog states the estimate and lists sources', async () => {
    await page.click('#dataBanner'); await page.waitForSelector('#dataDialog[open]'); const t = await page.textContent('#dataContent');
    assert.match(t, /ESTIMATED/); assert.match(t, /All estimated/); assert.match(t, /cuchd\.in|iviewd|CollegeSearch/); await page.screenshot({ path: path.join(shots, '08-data-quality.png') }); await page.keyboard.press('Escape');
  });
  await step('URL deep link restores a route', async () => {
    const p2 = await browser.newPage({ viewport: { width: 800, height: 500 } }); p2.setDefaultTimeout(150000); await page.goto('about:blank'); await p2.goto(srv.url + '/#from=gate-4&to=cricket-ground');
    await p2.waitForSelector('#result:not([hidden])', { timeout: 150000 }); assert.equal(await p2.inputValue('#toInput'), 'Cricket Ground'); await p2.close();
  });
  await step('no console errors, page errors or failed requests', async () => assert.deepEqual(problems, []));

  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.goto(srv.url + '/#from=gate-1&to=girls-hostel-2'); await m.waitForSelector('#result:not([hidden])', { timeout: 90000 }); await m.waitForTimeout(1800);
  await step('mobile layout: bottom-sheet panel, no horizontal overflow', async () => {
    const r = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, p: document.querySelector('#panel').getBoundingClientRect().toJSON() }));
    assert.ok(r.sw <= r.cw, 'horizontal overflow'); assert.ok(r.p.bottom >= 830 && r.p.width >= 385, JSON.stringify(r.p));
    await m.screenshot({ path: path.join(shots, '09-mobile.png') });
  });
} finally { await browser.close(); await srv.close(); }
console.log(failed ? `\n${failed} e2e step(s) FAILED` : '\nall e2e steps passed'); process.exit(failed ? 1 : 0);
