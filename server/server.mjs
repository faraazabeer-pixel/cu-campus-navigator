// HTTP backend: REST API in front of the C++ route engine + static hosting of the 3D frontend.
// No runtime npm dependencies - only Node's standard library.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { EngineClient } from './engine-client.mjs';
import { buildIndex, searchPlaces } from '../public/js/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self' blob:",
};

export async function createServer({ port = 5173, host = process.env.HOST || '0.0.0.0', dataPath = path.join(ROOT, 'data', 'campus.json'), binary = process.env.ROUTE_ENGINE || path.join(ROOT, 'build', 'route_engine'), publicDir = path.join(ROOT, 'public'), log = true } = {}) {
  const campusRaw = fs.readFileSync(dataPath);
  const campus = JSON.parse(campusRaw);
  const etag = '"' + crypto.createHash('sha1').update(campusRaw).digest('hex').slice(0, 16) + '"';
  const campusGz = zlib.gzipSync(campusRaw);
  const index = buildIndex(campus.places);
  const placeIds = new Set(campus.places.map((p) => p.id));
  const nodeIds = new Set(campus.graph.nodes.map((n) => n.id));
  const engine = new EngineClient({ binary, dataPath });
  let engineError = null;
  try { await engine.start(); } catch (e) { engineError = e.message; if (log) console.error('[engine] ' + e.message); }

  const json = (res, code, body, extra = {}) => {
    const s = JSON.stringify(body);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY, ...extra });
    res.end(s);
  };
  const err = (res, code, errCode, message) => json(res, code, { ok: false, error: { code: errCode, message } });

  // endpoint syntax: place id | node id | "x,z"
  function parseEndpoint(raw, name) {
    if (typeof raw !== 'string' || !raw.length || raw.length > 64) return { error: `${name} is required` };
    if (placeIds.has(raw) || nodeIds.has(raw)) return { value: raw };
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(raw);
    if (m) {
      const x = +m[1], z = +m[2];
      if (Math.abs(x) > 5000 || Math.abs(z) > 5000) return { error: `${name} coordinates are outside the campus area` };
      return { value: { x, z } };
    }
    return { error: `unknown ${name} "${raw.slice(0, 40)}"`, code: 'UNKNOWN_ENDPOINT' };
  }

  async function handleRoute(res, from, to, profile, visualize = false) {
    const f = parseEndpoint(from, 'from'), t = parseEndpoint(to, 'to');
    if (f.error) return err(res, 400, f.code || 'BAD_REQUEST', f.error);
    if (t.error) return err(res, 400, t.code || 'BAD_REQUEST', t.error);
    if (profile && !['walk', 'accessible'].includes(profile)) return err(res, 400, 'BAD_PROFILE', 'profile must be "walk" or "accessible"');
    if (engineError && !engine.proc) return err(res, 503, 'ENGINE_UNAVAILABLE', engineError);
    try {
      const r = await engine.request({ op: 'route', from: f.value, to: t.value, profile: profile || 'walk', visualize: !!visualize });
      delete r.id;
      return json(res, r.ok ? 200 : 400, r);
    } catch (e) { return err(res, 503, 'ENGINE_UNAVAILABLE', e.message); }
  }

  const serveStatic = (req, res, url) => {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir + path.sep) && file !== publicDir) return err(res, 403, 'FORBIDDEN', 'forbidden');
    let st; try { st = fs.statSync(file); } catch { st = null; }
    if (!st || !st.isFile()) {
      if (path.extname(rel)) return err(res, 404, 'NOT_FOUND', 'not found');
      return serveFile(req, res, path.join(publicDir, 'index.html'));
    }
    serveFile(req, res, file);
  };
  const serveFile = (req, res, file) => {
    const st = fs.statSync(file), ext = path.extname(file).toLowerCase();
    const tag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: tag, 'Cache-Control': file.includes(`${path.sep}vendor${path.sep}`) ? 'public, max-age=86400' : 'no-cache', ...SECURITY };
    if (req.headers['if-none-match'] === tag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  };

  const server = http.createServer(async (req, res) => {
    const t0 = Date.now();
    res.on('finish', () => { if (log && req.url.startsWith('/api/')) console.log(`${req.method} ${req.url.slice(0, 120)} -> ${res.statusCode} ${Date.now() - t0}ms`); });
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;
      if (!['GET', 'HEAD', 'POST'].includes(req.method)) return err(res, 405, 'METHOD_NOT_ALLOWED', 'method not allowed');
      if (p === '/api/health') {
        return json(res, engine.proc ? 200 : 503, { ok: !!engine.proc, engine: engine.proc ? { ...engine.info, restarts: engine.restarts } : null, error: engine.proc ? undefined : engineError, dataset: { status: campus.meta.status, hash: campus.meta.sourceHash } });
      }
      if (p === '/api/campus') {
        const h = { 'Content-Type': 'application/json; charset=utf-8', ETag: etag, 'Cache-Control': 'no-cache', ...SECURITY, Vary: 'Accept-Encoding' };
        if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); return res.end(); }
        if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { res.writeHead(200, { ...h, 'Content-Encoding': 'gzip' }); return res.end(campusGz); }
        res.writeHead(200, h); return res.end(campusRaw);
      }
      if (p === '/api/campus.geojson') { try { const g = fs.readFileSync(dataPath.replace(/\.json$/, '.geojson')); res.writeHead(200, { 'Content-Type': 'application/geo+json', 'Content-Disposition': 'attachment; filename="cu-campus.geojson"', ...SECURITY }); return res.end(g); } catch { return err(res, 404, 'NOT_FOUND', 'geojson not built'); } }
      if (p === '/api/places') return json(res, 200, { ok: true, places: campus.places.map(({ id, name, kind, aliases, nameConfidence, centroid }) => ({ id, name, kind, aliases, nameConfidence, centroid })) });
      if (p === '/api/search') {
        const q = (url.searchParams.get('q') || '').slice(0, 80);
        const limit = Math.max(1, Math.min(25, parseInt(url.searchParams.get('limit') || '8', 10) || 8));
        return json(res, 200, { ok: true, query: q, results: searchPlaces(index, q, limit).map((r) => ({ id: r.place.id, name: r.place.name, kind: r.place.kind, nameConfidence: r.place.nameConfidence, score: r.score })) });
      }
      if (p === '/api/route') {
        if (req.method === 'POST') {
          let body = ''; for await (const c of req) { body += c; if (body.length > 4096) return err(res, 413, 'TOO_LARGE', 'request too large'); }
          let b; try { b = JSON.parse(body || '{}'); } catch { return err(res, 400, 'BAD_REQUEST', 'invalid JSON body'); }
          const coord = (v) => (v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.z) ? `${v.x},${v.z}` : v);
          return handleRoute(res, coord(b.from), coord(b.to), b.profile, b.visualize);
        }
        return handleRoute(res, url.searchParams.get('from'), url.searchParams.get('to'), url.searchParams.get('profile'), url.searchParams.get('visualize') === 'true');
      }
      if (p.startsWith('/api/')) return err(res, 404, 'NOT_FOUND', 'unknown API endpoint');
      return serveStatic(req, res, url);
    } catch (e) {
      if (log) console.error(e);
      if (!res.headersSent) err(res, 500, 'INTERNAL', 'internal error'); else res.end();
    }
  });

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  const addr = server.address();
  return { server, engine, port: addr.port, url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${addr.port}`, close: () => new Promise((r) => { engine.close(); server.close(() => r()); server.closeAllConnections?.(); }) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5173), host = process.env.HOST || '0.0.0.0';
  createServer({ port, host }).then((s) => {
    console.log(`CU 3D Campus Navigator running at ${s.url}`);
    if (!s.engine.proc) console.log('WARNING: C++ route engine is not running - run "npm run build:engine" first.');
    const stop = () => s.close().then(() => process.exit(0));
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
