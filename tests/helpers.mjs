import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data', 'campus.json');
export const BIN = path.join(ROOT, 'build', 'route_engine');
export const loadCampus = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));

/** Independent reference router (plain O(V^2) Dijkstra in JS) used to cross-check the C++ engine. */
export function referenceDistances(campus, sources) {
  const idx = new Map(campus.graph.nodes.map((n, i) => [n.id, i]));
  const n = campus.graph.nodes.length, adj = Array.from({ length: n }, () => []);
  for (const e of campus.graph.edges) { adj[idx.get(e.a)].push([idx.get(e.b), e.len]); adj[idx.get(e.b)].push([idx.get(e.a), e.len]); }
  const d = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
  for (const s of sources) d[idx.get(s)] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1, best = Infinity; for (let i = 0; i < n; i++) if (!done[i] && d[i] < best) { best = d[i]; u = i; }
    if (u < 0) break; done[u] = 1;
    for (const [v, w] of adj[u]) if (d[u] + w < d[v]) d[v] = d[u] + w;
  }
  return { idx, d };
}
