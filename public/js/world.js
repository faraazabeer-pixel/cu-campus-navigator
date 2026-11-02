// Builds the static 3D world (terrain, carriageways, footpaths, buildings, landmarks, vegetation)
// from the compiled campus dataset. Coordinates: x = east, z = south, y = up (metres).
import * as THREE from '../vendor/three/three.module.min.js';
import * as T from './textures.js';

const FLOOR_H = 3.6;
const TAU = Math.PI * 2;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export const CATEGORY_STYLE = {
  academic: { wall: '#eee5d4', roof: '#b6a58f', accent: '#c98b5a', label: 'Academic' },
  library: { wall: '#d5e1f0', roof: '#7f94ad', accent: '#4f78b5', label: 'Library' },
  food: { wall: '#f7d29d', roof: '#c9874a', accent: '#e5822f', label: 'Food' },
  hostel: { wall: '#f1cdb9', roof: '#b5826b', accent: '#c4694a', label: 'Hostel' },
  sports: { wall: '#cfe4da', roof: '#6d9a88', accent: '#2f8f6b', label: 'Sports' },
  admin: { wall: '#e7d8ee', roof: '#9b84aa', accent: '#8a5fb0', label: 'Admin' },
  medical: { wall: '#fbe4e4', roof: '#d27d7d', accent: '#d8483f', label: 'Medical' },
  bank: { wall: '#dfe8c9', roof: '#8ea06a', accent: '#6b8f2f', label: 'Bank' },
  auditorium: { wall: '#dcd3ee', roof: '#78a99a', accent: '#6a52b0', label: 'Auditorium' },
  gate: { wall: '#d2d8e0', roof: '#5b6b82', accent: '#2b4a7a', label: 'Gate' },
  landmark: { wall: '#e8e0d0', roof: '#a59a86', accent: '#d09a2b', label: 'Landmark' },
  parking: { wall: '#cfd3d8', roof: '#7a7f88', accent: '#5a6270', label: 'Parking' },
};

export class Geo { // tiny merged-geometry builder for flat ribbons
  constructor() { this.p = []; this.uv = []; this.i = []; }
  quad(a, b, c, d, uvs) { const n = this.p.length / 3; this.p.push(...a, ...b, ...c, ...d); this.uv.push(...uvs); this.i.push(n, n + 2, n + 1, n, n + 3, n + 2); }
  segment(ax, az, bx, bz, w, y, v0 = 0, v1 = 1) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * (w / 2), nz = (dx / l) * (w / 2);
    this.quad([ax + nx, y, az + nz], [ax - nx, y, az - nz], [bx - nx, y, bz - nz], [bx + nx, y, bz + nz], [0, v0, 1, v0, 1, v1, 0, v1]);
  }
  polyline(pts, w, y, uvPeriod = 0) { // mitred ribbon with cumulative-length V
    const n = pts.length; if (n < 2) return;
    const L = [], R = []; let acc = 0; const V = [0];
    for (let i = 1; i < n; i++) { acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); V.push(acc); }
    const nrm = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
    for (let i = 0; i < n; i++) {
      let m;
      if (i === 0) m = nrm(pts[0], pts[1]); else if (i === n - 1) m = nrm(pts[n - 2], pts[n - 1]);
      else { const a = nrm(pts[i - 1], pts[i]), b = nrm(pts[i], pts[i + 1]); let mx = a[0] + b[0], mz = a[1] + b[1]; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml; const k = 1 / Math.max(0.4, mx * a[0] + mz * a[1]); m = [mx * k, mz * k]; }
      L.push([pts[i][0] + m[0] * w / 2, pts[i][1] + m[1] * w / 2]); R.push([pts[i][0] - m[0] * w / 2, pts[i][1] - m[1] * w / 2]);
    }
    for (let i = 0; i + 1 < n; i++) {
      const v0 = uvPeriod ? V[i] / uvPeriod : 0, v1 = uvPeriod ? V[i + 1] / uvPeriod : 1;
      this.quad([L[i][0], y, L[i][1]], [R[i][0], y, R[i][1]], [R[i + 1][0], y, R[i + 1][1]], [L[i + 1][0], y, L[i + 1][1]], [0, v0, 1, v0, 1, v1, 0, v1]);
    }
  }
  mesh(material, { receive = true, order = 0 } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const nrm = new Float32Array(this.p.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setIndex(this.i);
    const m = new THREE.Mesh(g, material); m.receiveShadow = receive; m.renderOrder = order; return m;
  }
}

const flatMat = (color, layer, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer, ...extra });

function polygonFlat(poly, y, material, bboxUV = true, worldUV = false) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const pos = g.attributes.position;
  if (worldUV) {
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / 80;
      uv[i * 2 + 1] = pos.getZ(i) / 80;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  } else if (bboxUV) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < pos.count; i++) { x0 = Math.min(x0, pos.getX(i)); x1 = Math.max(x1, pos.getX(i)); z0 = Math.min(z0, pos.getZ(i)); z1 = Math.max(z1, pos.getZ(i)); }
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) - x0) / (x1 - x0); uv[i * 2 + 1] = 1 - (pos.getZ(i) - z0) / (z1 - z0); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  const m = new THREE.Mesh(g, material); m.receiveShadow = true; return m;
}

function extrudePoly(poly, base, height, materials) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, base, 0);
  const m = new THREE.Mesh(g, materials); m.castShadow = true; m.receiveShadow = true; return m;
}

const orientedRect = (poly) => { // for 4-point polygons
  const [a, b, , d] = poly;
  const u = [b[0] - a[0], b[1] - a[1]], v = [d[0] - a[0], d[1] - a[1]];
  const w = Math.hypot(...u), dd = Math.hypot(...v);
  const cx = poly.reduce((s, p) => s + p[0], 0) / 4, cz = poly.reduce((s, p) => s + p[1], 0) / 4;
  return { cx, cz, w, d: dd, u: [u[0] / w, u[1] / w], v: [v[0] / dd, v[1] / dd] };
};
const rectPoly = (r, cx, cz, w, d) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [cx + r.u[0] * sx * w / 2 + r.v[0] * sz * d / 2, cz + r.u[1] * sx * w / 2 + r.v[1] * sz * d / 2]);

function getElevation(x, z, cx, cz) {
  const dist = Math.hypot(x - cx, z - cz);
  if (dist <= 620) return 0.05;
  const th = Math.atan2(z - cz, x - cx);
  const northFactor = Math.pow(Math.max(0, -Math.sin(th)), 1.4);
  if (northFactor <= 0) return 0.05;
  const t = Math.max(0, (dist - 620) / (6500 - 620));
  return t * northFactor * (75 + 65 * Math.sin(2.2 * th + 0.3) + 30 * Math.sin(dist / 360)) + 0.05;
}

function createRollingCountrysideRing(cx, cz, rInner = 560, rOuter = 6500, rings = 40, segs = 96) {
  const geo = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let ri = 0; ri <= rings; ri++) {
    const frac = ri / rings;
    const r = rInner + (rOuter - rInner) * Math.pow(frac, 1.3);
    const t = Math.max(0, (r - 620) / (rOuter - 620));

    for (let si = 0; si <= segs; si++) {
      const theta = (si / segs) * Math.PI * 2;
      const x = cx + r * Math.cos(theta);
      const z = cz + r * Math.sin(theta);

      const northFactor = Math.pow(Math.max(0, -Math.sin(theta)), 1.4);
      const y = t * northFactor * (75 + 65 * Math.sin(2.2 * theta + 0.3) + 30 * Math.sin(r / 360)) + 0.05;

      positions.push(x, y, z);
      uvs.push((x - cx) / 1000, (z - cz) / 1000);
    }
  }

  const stride = segs + 1;
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < segs; si++) {
      const a = ri * stride + si;
      const b = (ri + 1) * stride + si;
      const c = (ri + 1) * stride + (si + 1);
      const d = ri * stride + (si + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: T.countrysideTexture(),
    roughness: 0.95,
    metalness: 0.02
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'countrysideSkirt';
  return mesh;
}

export function buildWorld(campus) {
  const root = new THREE.Group();
  const updaters = [];
  const placeObjects = new Map();
  const pickables = [];
  const layers = { trees: new THREE.Group(), graph: new THREE.Group(), lamps: new THREE.Group() };
  const lamps = [];
  const glow = []; // materials that light up at dusk
  const cuSignLights = [];
  const places = campus.places, edges = campus.graph.edges, nodes = new Map(campus.graph.nodes.map((n) => [n.id, n]));
  const bounds = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const [x, z] of campus.boundary) { bounds.x0 = Math.min(bounds.x0, x); bounds.x1 = Math.max(bounds.x1, x); bounds.z0 = Math.min(bounds.z0, z); bounds.z1 = Math.max(bounds.z1, z); }

  // ---------------------------------------------------------------- ground & regional terrain
  const cx = (bounds.x0 + bounds.x1) / 2, cz = (bounds.z0 + bounds.z1) / 2;

  // Vast base foundation plane with seamless real-world scale grass texture matching the campus
  const baseGrassTex = T.grassTexture();
  baseGrassTex.repeat.set(14000 / 80, 14000 / 80);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(14000, 14000),
    new THREE.MeshStandardMaterial({ map: baseGrassTex, roughness: 0.94, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, 0.0, cz);
  ground.receiveShadow = true;
  ground.name = 'ground';
  root.add(ground);

  // Expansive rolling countryside terrain skirt (560 m to 6400 m radius, perfectly flush with flat campus)
  const terrainMesh = createRollingCountrysideRing(cx, cz, 560, 6400, 40, 96);
  root.add(terrainMesh);

  // Campus ground surface (inside the boundary) aligned with the base plane
  const campusGrassMat = new THREE.MeshStandardMaterial({
    map: T.grassTexture(),
    roughness: 0.92,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const campusGround = polygonFlat(campus.boundary, 0.02, campusGrassMat, false, true);
  root.add(campusGround);

  // ---------------------------------------------------------------- areas (lawns, plaza)
  const lawnTones = ['#6ba552', '#72ac57', '#639c4a'];
  campus.areas.forEach((a, i) => {
    if (a.type === 'lawn') {
      const m = polygonFlat(a.polygon, 0.05, flatMat(lawnTones[i % 3], 2), false);
      root.add(m);
    }
    if (a.type === 'plaza') {
      const xs = a.polygon.map((p) => p[0]), zs = a.polygon.map((p) => p[1]);
      const acx = (Math.min(...xs) + Math.max(...xs)) / 2, acz = (Math.min(...zs) + Math.max(...zs)) / 2, r = (Math.max(...xs) - Math.min(...xs)) / 2;
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshStandardMaterial({ map: T.plazaTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      m.rotation.x = -Math.PI / 2; m.position.set(acx, 0.08, acz); m.receiveShadow = true; root.add(m);
    }
  });

  // ---------------------------------------------------------------- roads
  const asphaltTex = T.asphaltTexture();
  const asphalt = new THREE.MeshStandardMaterial({
    color: '#3d4147',
    map: asphaltTex,
    roughness: 0.92,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const kerb = flatMat('#9ea3ab', 4, { roughness: 0.85 });
  const dash = new THREE.MeshBasicMaterial({ map: T.dashTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const roadGeo = new Geo(), kerbGeo = new Geo(), dashGeo = new Geo();
  for (const r of campus.roads) {
    kerbGeo.polyline(r.points, r.width + 1.2, 0.09);
    roadGeo.polyline(r.points, r.width, 0.12, 16);
    if (r.class === 'highway') { dashGeo.polyline(r.points, 0.45, 0.15, 10); }
    else if (r.width >= 9) dashGeo.polyline(r.points, 0.35, 0.15, 8);
  }
  root.add(kerbGeo.mesh(kerb)); root.add(roadGeo.mesh(asphalt)); root.add(dashGeo.mesh(dash, { receive: false, order: 2 }));

  // ---------------------------------------------------------------- footpaths from the routing graph
  const kindStyle = { sidewalk: ['#e3dccb', 5, 2.4], footpath: ['#ddd3bd', 5, 4], plaza: ['#d8ccb4', 6, 4], entrance: ['#d3c9b3', 5, 2.6] };
  const byKind = {}; const discs = [];
  const zebraSegs = [];
  for (const e of edges) {
    const a = nodes.get(e.a), b = nodes.get(e.b);
    if (e.kind === 'crossing') { zebraSegs.push([a, b, e.width || 4]); continue; }
    (byKind[e.kind] ||= new Geo()).segment(a.x, a.z, b.x, b.z, e.width, 0.16 + (e.kind === 'plaza' ? 0.06 : 0));
    discs.push([a.x, a.z, e.width, e.kind]); discs.push([b.x, b.z, e.width, e.kind]);
  }
  for (const [k, g] of Object.entries(byKind)) { const st = kindStyle[k] || kindStyle.footpath; root.add(g.mesh(flatMat(st[0], st[1]))); }
  const discGeo = new THREE.CircleGeometry(0.5, 12); discGeo.rotateX(-Math.PI / 2);
  const discMesh = new THREE.InstancedMesh(discGeo, flatMat('#ddd3bd', 5), discs.length); const dm = new THREE.Matrix4();
  discs.forEach(([x, z, w, kind], i) => { dm.makeScale(w, 1, w); dm.setPosition(x, kind === 'plaza' ? 0.22 : 0.165, z); discMesh.setMatrixAt(i, dm); });
  discMesh.receiveShadow = true; root.add(discMesh);

  // zebra crossings
  const zebraMat = new THREE.MeshBasicMaterial({ color: '#f4f1e8', polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8, side: THREE.DoubleSide });
  const zg = new THREE.PlaneGeometry(1, 1); zg.rotateX(-Math.PI / 2);
  const zebraCount = zebraSegs.reduce((s, [, , w]) => s + Math.max(2, Math.floor(w / 0.9)), 0);
  const zebra = new THREE.InstancedMesh(zg, zebraMat, zebraCount); let zi = 0;
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  for (const [a, b, w] of zebraSegs) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
    const n = Math.max(2, Math.floor(w / 0.9));
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 0.95, px = -dz / len * off, pz = dx / len * off;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      sc.set(0.5, 1, Math.max(0.5, len - 3.2)); ps.set((a.x + b.x) / 2 + px, 0.18, (a.z + b.z) / 2 + pz);
      dm.compose(ps, q, sc); zebra.setMatrixAt(zi++, dm);
    }
  }
  zebra.count = zi; root.add(zebra);

  // ---------------------------------------------------------------- buildings (no artificial perimeter boundary wall, allowing campus to blend naturally with countryside)

  // ---------------------------------------------------------------- buildings
  const fac = T.facadeTextures();
  fac.map.repeat.set(1 / 4, -1 / FLOOR_H); fac.map.offset.set(0, 1 / FLOOR_H);
  fac.emissive.repeat.copy(fac.map.repeat); fac.emissive.offset.copy(fac.map.offset);
  const wallMats = new Map(); const roofMats = new Map();
  const wallMat3 = (cat) => {
    if (wallMats.has(cat)) return wallMats.get(cat);
    const st = CATEGORY_STYLE[cat] || CATEGORY_STYLE.academic;
    const m = new THREE.MeshStandardMaterial({ color: st.wall, map: fac.map, emissiveMap: fac.emissive, emissive: '#000000', roughness: 0.82, metalness: 0.02 });
    wallMats.set(cat, m); glow.push({ mat: m, on: '#ffd9a0' }); return m;
  };
  const roofMat3 = (cat) => { if (!roofMats.has(cat)) roofMats.set(cat, new THREE.MeshStandardMaterial({ color: (CATEGORY_STYLE[cat] || CATEGORY_STYLE.academic).roof, roughness: 0.9 })); return roofMats.get(cat); };
  const accentMat = (cat) => new THREE.MeshStandardMaterial({ color: (CATEGORY_STYLE[cat] || CATEGORY_STYLE.academic).accent, roughness: 0.6 });
  const stone = new THREE.MeshStandardMaterial({ color: '#c9c3b6', roughness: 0.9 });
  const water = new THREE.MeshStandardMaterial({ color: '#4fb6df', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });

  const addRoofProps = (g, poly, top, rnd, count) => {
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    for (let i = 0; i < count; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.5 + rnd() * 2, 1.2 + rnd(), 2 + rnd() * 2), new THREE.MeshStandardMaterial({ color: '#9aa1aa', roughness: 0.7 }));
      b.position.set(cx + (rnd() - 0.5) * 14, top + 0.7, cz + (rnd() - 0.5) * 8); b.castShadow = true; g.add(b);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 14), new THREE.MeshStandardMaterial({ color: '#2f3f56', roughness: 0.5 }));
    tank.position.set(cx + (rnd() - 0.5) * 10, top + 1.2, cz + (rnd() - 0.5) * 6); tank.castShadow = true; g.add(tank);
  };

  function standardBuilding(p, g) {
    const rnd = mulberry(hash(p.id)), cat = p.kind, H = Math.max(p.height, FLOOR_H);
    const wm = wallMat3(cat), rm = roofMat3(cat), mats = [rm, wm];
    const fp = p.footprint, isRect = fp.length === 4;
    const style = isRect ? (cat === 'hostel' ? 'slab' : ['block', 'podium', 'ell'][hash(p.id) % 3]) : 'block';
    let top = H;
    if (style === 'podium' && H > 3 * FLOOR_H) {
      const r = orientedRect(fp), podH = FLOOR_H * 2;
      g.add(extrudePoly(fp, 0, podH, mats));
      const tw = r.w * 0.72, td = r.d * 0.8, shift = (rnd() > 0.5 ? 1 : -1) * r.d * 0.1;
      g.add(extrudePoly(rectPoly(r, r.cx + r.v[0] * shift, r.cz + r.v[1] * shift, tw, td), podH, H - podH, mats));
      g.add(extrudePoly(fp.map(([x, z]) => [r.cx + (x - r.cx) * 1.015, r.cz + (z - r.cz) * 1.015]), podH - 0.7, 0.6, [accentMat(cat), accentMat(cat)]));
      g.add(extrudePoly(rectPoly(r, r.cx + r.v[0] * shift, r.cz + r.v[1] * shift, tw + 0.7, td + 0.7), H - 1.3, 1.0, [accentMat(cat), accentMat(cat)]));
    } else if (style === 'ell' && H > 2 * FLOOR_H) {
      const r = orientedRect(fp);
      const sgn = rnd() > 0.5 ? 1 : -1;
      g.add(extrudePoly(rectPoly(r, r.cx + r.v[0] * r.d * 0.25 * sgn, r.cz + r.v[1] * r.d * 0.25 * sgn, r.w, r.d * 0.5), 0, H, mats));
      const h2 = Math.max(FLOOR_H * 2, Math.round((H * 0.8) / FLOOR_H) * FLOOR_H);
      const side = rnd() > 0.5 ? 1 : -1;
      g.add(extrudePoly(rectPoly(r, r.cx + r.u[0] * r.w * 0.28 * side, r.cz + r.u[1] * r.w * 0.28 * side, r.w * 0.44, r.d), 0, h2, mats));
    } else if (style === 'slab') {
      g.add(extrudePoly(fp, 0, H, mats));
      const r = orientedRect(fp);
      for (const s of [-1, 1]) g.add(extrudePoly(rectPoly(r, r.cx + r.u[0] * s * (r.w / 2 - 4), r.cz + r.u[1] * s * (r.w / 2 - 4), 6, r.d + 1), H, FLOOR_H, [roofMat3(cat), roofMat3(cat)]));
      top = H + FLOOR_H;
    } else {
      g.add(extrudePoly(fp, 0, H, mats));
    }
    // roof cap + accent parapet
    const r = isRect ? orientedRect(fp) : null;
    if (isRect && (style === 'block' || style === 'slab')) g.add(extrudePoly(rectPoly(r, r.cx, r.cz, r.w + 0.7, r.d + 0.7), H - 1.3, 1.0, [accentMat(cat), accentMat(cat)]));
    addRoofProps(g, fp, top, rnd, 1 + Math.floor(rnd() * 2));
    return top;
  }

  function addGate(p, g) {
    const r = orientedRect(p.footprint), w = r.w;
    const pm = new THREE.MeshStandardMaterial({ color: '#cfc7b6', roughness: 0.85 }), band = new THREE.MeshStandardMaterial({ color: '#2b4a7a', roughness: 0.6 });
    for (const s of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(3.4, 9, 3.4), pm); pil.position.set(p.centroid[0] + s * (w / 2 - 2), 4.5, p.centroid[1]); pil.castShadow = true; g.add(pil);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.8, 4.2), band); cap.position.set(p.centroid[0] + s * (w / 2 - 2), 9.4, p.centroid[1]); g.add(cap);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w - 2, 2.6, 2.4), pm); beam.position.set(p.centroid[0], 8.4, p.centroid[1]); beam.castShadow = true; g.add(beam);
    const label = p.name.replace(/\s*\(.*\)/, '').toUpperCase();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshBasicMaterial({ map: T.signTexture(label), side: THREE.DoubleSide }));
    sign.position.set(p.centroid[0], 8.4, p.centroid[1] + 1.3); g.add(sign);
    const sign2 = sign.clone(); sign2.position.z = p.centroid[1] - 1.3; g.add(sign2);
    return 11;
  }

  function addFountain(p, g) {
    const [cx, cz] = p.centroid;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 10, 1.3, 40), stone); base.position.set(cx, 0.65, cz); base.castShadow = true; base.receiveShadow = true; g.add(base);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 0.2, 40), water); w.position.set(cx, 1.25, cz); g.add(w);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 4.2, 16), stone); pillar.position.set(cx, 3.2, cz); pillar.castShadow = true; g.add(pillar);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 1.4, 0.9, 24), stone); bowl.position.set(cx, 5.2, cz); bowl.castShadow = true; g.add(bowl);
    const N = 220, pos = new Float32Array(N * 3), seed = Array.from({ length: N }, (_, i) => ({ a: (i / N) * TAU * 7.3, v: 4 + (i % 11) * 0.45, t0: (i * 0.137) % 1.6 }));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#e8f7ff', size: 0.55, transparent: true, opacity: 0.85, depthWrite: false })); pts.frustumCulled = false; g.add(pts);
    updaters.push((t) => {
      for (let i = 0; i < N; i++) {
        const s = seed[i], ph = ((t * 0.9 + s.t0) % 1.6), h = s.v * ph - 5 * ph * ph, rad = (i % 3 === 0 ? 0 : 1.4 + (i % 5) * 0.55) * Math.min(1, ph * 1.3);
        pos[i * 3] = cx + Math.cos(s.a) * rad; pos[i * 3 + 1] = Math.max(1.3, 5.5 + h); pos[i * 3 + 2] = cz + Math.sin(s.a) * rad;
      }
      geo.attributes.position.needsUpdate = true;
    });
    return 6;
  }

  function addStadium(p, g) {
    const r = orientedRect(p.footprint), H = 7.2, wm = wallMat3('sports'), rm = roofMat3('sports');
    g.add(extrudePoly(p.footprint, 0, H, [rm, wm]));
    const along = r.w >= r.d ? r.u : r.v, len = Math.max(r.w, r.d), rad = Math.min(r.w, r.d) / 2;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 24, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#8fb7a6', roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide }));
    cyl.rotation.order = 'YZX'; cyl.rotation.y = -Math.atan2(along[1], along[0]); cyl.rotation.z = Math.PI / 2; cyl.scale.set(0.55, 1, 1);
    cyl.position.set(r.cx, H, r.cz); cyl.castShadow = true; g.add(cyl);
    return H + rad * 0.55;
  }

  function addAuditorium(p, g) {
    const r = orientedRect(p.footprint), H = p.height, wm = wallMat3('auditorium'), rm = roofMat3('auditorium');
    g.add(extrudePoly(p.footprint, 0, H, [rm, wm]));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(Math.min(r.w, r.d) * 0.4, 32, 16, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#79b8a6', roughness: 0.4, metalness: 0.3 }));
    dome.scale.set(1, 0.7, 1); dome.position.set(r.cx, H, r.cz); dome.castShadow = true; g.add(dome);
    return H + Math.min(r.w, r.d) * 0.28;
  }

  function addFoodCourt(p, g) {
    const top = standardBuilding(p, g);
    const r = orientedRect(p.footprint);
    g.add(extrudePoly(rectPoly(r, r.cx, r.cz, r.w + 2.2, r.d + 2.2), 3.3, 0.45, accentMat('food')));
    // outdoor seating: little tables
    const rnd = mulberry(hash(p.id));
    const tm = new THREE.MeshStandardMaterial({ color: '#e5822f', roughness: 0.7 });
    for (let i = 0; i < 14; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.9, 10), tm); const s = rnd() > 0.5 ? 1 : -1; t.position.set(r.cx + (rnd() - 0.5) * r.w, 0.5, r.cz + s * (r.d / 2 + 3 + rnd() * 2)); g.add(t); }
    return top;
  }

  function fieldBase(p, g, color, y = 0.1) {
    const m = polygonFlat(p.footprint, y, flatMat(color, 3), false); g.add(m); return m;
  }
  function floodlight(g, x, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 24, 8), new THREE.MeshStandardMaterial({ color: '#8b929c' })); pole.position.set(x, 12, z); pole.castShadow = true; g.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(5, 1.8, 0.8), new THREE.MeshStandardMaterial({ color: '#dfe3ea', emissive: '#000' })); head.position.set(x, 24.5, z); g.add(head);
    glow.push({ mat: head.material, on: '#fff6d6', strength: 1.2 });
  }
  function addCricket(p, g) {
    fieldBase(p, g, '#6ca855', 0.1);
    const [cx, cz] = p.centroid;
    const r = orientedRect(p.footprint);
    const radius = Math.min(r.w, r.d) * 0.485;
    const cg = new THREE.CircleGeometry(radius, 64);
    cg.rotateX(-Math.PI / 2);
    const cMesh = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({
      map: T.cricketTexture(),
      roughness: 0.88,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5
    }));
    cMesh.position.set(cx, 0.13, cz);
    cMesh.receiveShadow = true;
    g.add(cMesh);
    for (const [dx, dz] of [[-70, -52], [70, -52], [-70, 52], [70, 52]]) floodlight(g, cx + dx, cz + dz);
    return 3;
  }
  function addFootball(p, g) {
    const [cx, cz] = p.centroid;
    // Outer red clay running track
    g.add(polygonFlat(p.footprint, 0.11, flatMat('#b6513a', 3), false));
    // Inner green turf
    const inner = p.footprint.map(([x, z]) => [cx + (x - cx) * 0.8, cz + (z - cz) * 0.74]);
    g.add(polygonFlat(inner, 0.13, flatMat('#589e47', 5), false));
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(86, 52), new THREE.MeshStandardMaterial({ map: T.footballTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.set(cx, 0.17, cz); pitch.receiveShadow = true; g.add(pitch);
    for (const [dx, dz] of [[-62, -34], [62, -34], [-62, 34], [62, 34]]) floodlight(g, cx + dx, cz + dz);
    for (const s of [-1, 1]) { const goal = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 7.3), new THREE.MeshStandardMaterial({ color: '#fff' })); goal.position.set(cx + s * 43, 1.2, cz); g.add(goal); }
    return 3;
  }
  function addPool(p, g) {
    const r = orientedRect(p.footprint);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(r.w + 12, 0.3, r.d + 10), new THREE.MeshStandardMaterial({ color: '#e0dccf', roughness: 0.9 })); deck.position.set(r.cx, 0.15, r.cz); deck.receiveShadow = true; g.add(deck);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ map: T.poolTexture(), roughness: 0.15, metalness: 0.05 })); pl.rotation.x = -Math.PI / 2; pl.position.set(r.cx, 0.34, r.cz); g.add(pl);
    return 2;
  }
  function addCourt(p, g) {
    const r = orientedRect(p.footprint); const type = p.courtType || 'volleyball';
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 4, r.d + 4), new THREE.MeshStandardMaterial({ color: type === 'tennis' ? '#3d7f5f' : '#9b5a3c', roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.set(r.cx, 0.12, r.cz); m.receiveShadow = true; g.add(m);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ map: T.courtTexture(type), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 })); s.rotation.x = -Math.PI / 2; s.position.set(r.cx, 0.16, r.cz); s.receiveShadow = true; g.add(s);
    const post = (x, z, h) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, h, 6), new THREE.MeshStandardMaterial({ color: '#d7dbe2' })); c.position.set(x, h / 2, z); c.castShadow = true; g.add(c); };
    if (type === 'basketball') { post(r.cx - r.w / 2 + 0.8, r.cz, 3.6); post(r.cx + r.w / 2 - 0.8, r.cz, 3.6); }
    if (type === 'tennis' || type === 'volleyball') { const net = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1), new THREE.MeshBasicMaterial({ color: '#fff' })); post(r.cx, r.cz - r.d / 2, 1.8); post(r.cx, r.cz + r.d / 2, 1.8); void net; }
    return 1;
  }
  function addTheatre(p, g) {
    const [cx, cz] = p.centroid; const mat = new THREE.MeshStandardMaterial({ color: '#cdbfa5', roughness: 0.9 });
    for (let i = 0; i < 7; i++) {
      const rIn = 12 + i * 3.4, rOut = rIn + 3.4;
      const shape = new THREE.Shape(); shape.absarc(0, 0, rOut, Math.PI / 2, (3 * Math.PI) / 2, false); shape.absarc(0, 0, rIn, (3 * Math.PI) / 2, Math.PI / 2, true);
      const ex = new THREE.ExtrudeGeometry(shape, { depth: 0.45 * (i + 1), bevelEnabled: false, curveSegments: 18 }); ex.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(ex, mat); m.position.set(cx + 4, 0.1, cz); m.rotation.y = 0; m.scale.set(1, 1, 1); m.castShadow = true; m.receiveShadow = true; g.add(m);
    }
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.9, 24, 1, false, 0, TAU), new THREE.MeshStandardMaterial({ color: '#a77e5a', roughness: 0.8 })); stage.position.set(cx + 4, 0.55, cz); stage.castShadow = true; stage.receiveShadow = true; g.add(stage);
    return 4;
  }
  function addParking(p, g) {
    const r = orientedRect(p.footprint);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ map: T.parkingTexture(), roughness: 1 })); pm.rotation.x = -Math.PI / 2; pm.position.set(r.cx, 0.13, r.cz); pm.receiveShadow = true; g.add(pm);
    const rnd = mulberry(hash(p.id)), cols = ['#c9d3de', '#2e3f5c', '#a63b34', '#e6e6e6', '#3b6a4f', '#d9b84a'];
    for (let row = 0; row < 2; row++) for (let i = 0; i < 12; i++) { if (rnd() > 0.55) continue;
      const c = new THREE.Mesh(new THREE.BoxGeometry(2, 1.3, 4.2), new THREE.MeshStandardMaterial({ color: cols[Math.floor(rnd() * cols.length)], roughness: 0.4, metalness: 0.4 }));
      c.position.set(r.cx - r.w / 2 + 14 / 512 * r.w + (i + 0.5) * ((r.w - 6) / 12), 0.75, r.cz + (row ? 1 : -1) * (r.d / 2 - 11)); c.castShadow = true; g.add(c); }
    return 1;
  }

  function addCUSignage(g, p, top) {
    const signGroup = new THREE.Group();
    signGroup.name = 'cu-architectural-sign';

    // B1 northern roof facade runs along z = -180 from x = 152 to x = 228 (width = 76m)
    // The sign is centered at x = 190, z = -179.8, elevated above the parapet facing North (-Z)
    const signW = 52, signH = 4.4;
    const signX = 190, signZ = -179.8, signY = top + signH / 2 + 0.35;

    // Clean plane geometry for architectural signage, scaled -1 on X so letters read forward
    const planeGeo = new THREE.PlaneGeometry(signW, signH);
    planeGeo.scale(-1, 1, 1);

    // 1. High-resolution illuminated red acrylic lettering
    const tex = T.cuSignTexture();
    const signMat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.05,
      roughness: 0.25,
      metalness: 0.1,
      color: '#ffffff',
      emissive: '#d60a16',
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide
    });
    // Register for night/dusk illumination
    glow.push({
      mat: signMat,
      on: '#ff1424',
      strength: 1.45,
      dayOn: '#d60a16',
      dayStrength: 0.35
    });

    // Front face facing North (-Z) towards the Ludhiana–Chandigarh Highway
    const frontPlane = new THREE.Mesh(planeGeo, signMat);
    frontPlane.rotation.y = 0; // Unrotated: reads left-to-right from North (-Z)
    frontPlane.position.set(signX, signY, signZ);
    frontPlane.castShadow = true;
    signGroup.add(frontPlane);

    // Rear dark enclosure backplate for 3D channel letters
    const backMat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.05,
      color: '#374151',
      roughness: 0.65,
      metalness: 0.6,
      side: THREE.DoubleSide
    });
    const backPlane = new THREE.Mesh(planeGeo, backMat);
    backPlane.rotation.y = 0;
    backPlane.position.set(signX, signY, signZ + 0.16);
    signGroup.add(backPlane);

    // 2. Realistic architectural steel framework (slender posts, crossbars, diagonal roof ties)
    const steelMat = new THREE.MeshStandardMaterial({ color: '#525b68', roughness: 0.45, metalness: 0.8 });

    // 2 horizontal mounting rails behind the letters
    for (const hRel of [-1.1, 1.1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(signW + 0.8, 0.09, 0.09), steelMat);
      rail.position.set(signX, signY + hRel, signZ + 0.22);
      signGroup.add(rail);
    }

    // Vertical structural tubular posts anchored into the roof parapet
    const postCount = 11;
    const postSpacing = signW / (postCount - 1);
    const startX = signX - signW / 2;
    for (let i = 0; i < postCount; i++) {
      const px = startX + i * postSpacing;
      // Vertical steel tubular post
      const vPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, signH + 0.8, 8), steelMat);
      vPost.position.set(px, top + (signH + 0.8) / 2, signZ + 0.22);
      vPost.castShadow = true;
      signGroup.add(vPost);

      // Diagonal rear strut bracing back into roof deck
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 8), steelMat);
      strut.rotation.x = Math.PI / 4;
      strut.position.set(px, top + 1.25, signZ + 1.4);
      signGroup.add(strut);

      // Steel roof footing plate
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.36), steelMat);
      plate.position.set(px, top + 0.03, signZ + 0.22);
      signGroup.add(plate);
    }

    // 3. Realistic architectural red glow wash lights
    const redLight = new THREE.PointLight('#ff1e2b', 0.4, 60, 1.8);
    redLight.position.set(signX, signY, signZ - 2.5);
    signGroup.add(redLight);

    cuSignLights.push({
      setDusk(on) {
        redLight.intensity = on ? 1.8 : 0.4;
      }
    });

    g.add(signGroup);
  }

  for (const p of places) {
    const g = new THREE.Group(); g.name = p.id;
    let top;
    switch (p.render) {
      case 'gate': top = addGate(p, g); break;
      case 'fountain': top = addFountain(p, g); break;
      case 'stadium': top = addStadium(p, g); break;
      case 'auditorium': top = addAuditorium(p, g); break;
      case 'foodcourt': top = addFoodCourt(p, g); break;
      case 'cricket': top = addCricket(p, g); break;
      case 'football': top = addFootball(p, g); break;
      case 'pool': top = addPool(p, g); break;
      case 'court': top = addCourt(p, g); break;
      case 'theatre': top = addTheatre(p, g); break;
      case 'parking': top = addParking(p, g); break;
      default: top = standardBuilding(p, g);
    }
    if (p.id === 'b1-engineering') {
      addCUSignage(g, p, top);
    }
    g.traverse((o) => { if (o.isMesh) { o.userData.placeId = p.id; pickables.push(o); } });
    g.userData = { placeId: p.id, top };
    root.add(g); placeObjects.set(p.id, g);
  }

  for (const sc of campus.scenery || []) { // un-routable background buildings (e.g. unnamed OSM footprints)
    const g = new THREE.Group(); standardBuilding({ id: sc.id, kind: sc.kind || 'academic', footprint: sc.footprint, height: sc.height }, g); root.add(g);
  }

  // ---------------------------------------------------------------- obstacle grid for vegetation
  const CELL = 24, grid = new Map(), key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const put = (x, z, item) => { const k = key(x, z); (grid.get(k) || grid.set(k, []).get(k)).push(item); };
  for (const p of places) {
    const xs = p.footprint.map((q) => q[0]), zs = p.footprint.map((q) => q[1]);
    for (let x = Math.min(...xs) - 4; x <= Math.max(...xs) + 4 + CELL; x += CELL) for (let z = Math.min(...zs) - 4; z <= Math.max(...zs) + 4 + CELL; z += CELL) put(x, z, { poly: p.footprint });
  }
  for (const e of edges) { const a = nodes.get(e.a), b = nodes.get(e.b); const n = Math.ceil(e.len / 10); for (let i = 0; i <= n; i++) { const t = i / n; put(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, { seg: [a, b] }); } }
  const dPoly = (x, z, poly) => { let inside = false, best = 1e9; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; const dx = xj - xi, dz = zj - zi, l2 = dx * dx + dz * dz; const t = l2 ? Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / l2)) : 0; best = Math.min(best, Math.hypot(x - (xi + dx * t), z - (zi + dz * t))); } return inside ? 0 : best; };
  const dSeg = (x, z, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz; const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0; return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)); };
  const dRoad = (x, z) => { let best = 1e9; for (const r of campus.roads) { for (let i = 0; i + 1 < r.points.length; i++) best = Math.min(best, dSeg(x, z, { x: r.points[i][0], z: r.points[i][1] }, { x: r.points[i + 1][0], z: r.points[i + 1][1] }) - r.width / 2); } return best; };
  const free = (x, z, clearBuilding = 3.5, clearPath = 3.2) => {
    if (x < bounds.x0 + 4 || x > bounds.x1 - 4 || z < bounds.z0 + 4 || z > bounds.z1 - 4) return false;
    for (const it of grid.get(key(x, z)) || []) { if (it.poly && dPoly(x, z, it.poly) < clearBuilding) return false; if (it.seg && dSeg(x, z, it.seg[0], it.seg[1]) < clearPath) return false; }
    return dRoad(x, z) > 3.5;
  };

  // trees (campus trees + highway tree lines + countryside rural groves)
  const rnd = mulberry(20240611);
  const treePts = [];
  const along = (pts, step, off, jitter) => { for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L; for (let s = rnd() * step; s < L; s += step * (0.8 + rnd() * 0.4)) for (const side of [-1, 1]) treePts.push([a[0] + (b[0] - a[0]) * s / L + nx * side * (off + rnd() * jitter), a[1] + (b[1] - a[1]) * s / L + nz * side * (off + rnd() * jitter)]); } };
  for (const r of campus.roads) if (r.class !== 'highway') along(r.points, 15, r.width / 2 + 7, 3);
  for (const a of campus.areas) if (a.type === 'lawn') { const xs = a.polygon.map((q) => q[0]), zs = a.polygon.map((q) => q[1]); const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs)); const n = Math.floor(area / 380); for (let i = 0; i < n; i++) { const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs)), z = Math.min(...zs) + rnd() * (Math.max(...zs) - Math.min(...zs)); treePts.push([x, z]); } }
  // Natural campus perimeter greenery and avenue landscaping
  for (const r of campus.roads) {
    if (r.class !== 'highway') along(r.points, 24, r.width / 2 + 14, 5);
  }
  const campusTrees = treePts.filter(([x, z]) => free(x, z));

  // Highway perimeter tree lines (along northern avenue / NH-95)
  const outerTrees = [];
  for (const r of campus.roads) {
    if (r.class === 'highway') {
      const pts = r.points;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        for (let s = 10; s < L; s += 22) {
          for (const side of [-1, 1]) {
            outerTrees.push([a[0] + (b[0] - a[0]) * (s / L) + nx * side * (r.width / 2 + 8), a[1] + (b[1] - a[1]) * (s / L) + nz * side * (r.width / 2 + 8)]);
          }
        }
      }
    }
  }

  // Countryside tree clumps in surrounding rural landscape (radii 880 m to 3400 m)
  const numGroves = 16;
  for (let g = 0; g < numGroves; g++) {
    const gRadius = 880 + rnd() * 2400;
    const gAngle = (g / numGroves) * TAU + (rnd() - 0.5) * 0.4;
    const gx = cx + gRadius * Math.cos(gAngle), gz = cz + gRadius * Math.sin(gAngle);
    const treesInGrove = 10 + Math.floor(rnd() * 8);
    for (let k = 0; k < treesInGrove; k++) {
      const tx = gx + (rnd() - 0.5) * 65;
      const tz = gz + (rnd() - 0.5) * 65;
      outerTrees.push([tx, tz]);
    }
  }

  const allTrees = [...campusTrees, ...outerTrees];

  const trunkG = new THREE.CylinderGeometry(0.28, 0.4, 1, 6); trunkG.translate(0, 0.5, 0);
  const canopyG = new THREE.IcosahedronGeometry(1, 1); canopyG.translate(0, 1, 0);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: '#6f5440', roughness: 1 }), allTrees.length);
  const canopies = new THREE.InstancedMesh(canopyG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), allTrees.length);
  const greens = ['#4f8f45', '#5e9e4f', '#3f7f3f', '#6aa656', '#7aa845'].map((c) => new THREE.Color(c));
  const tm = new THREE.Matrix4(); const qq = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3();

  allTrees.forEach(([x, z], i) => {
    const groundY = getElevation(x, z, cx, cz);
    const h = 5 + rnd() * 5, r = 2 + rnd() * 1.8;
    qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * TAU);
    tm.compose(pp.set(x, groundY, z), qq, ss.set(1, h * 0.55, 1));
    trunks.setMatrixAt(i, tm);
    tm.compose(pp.set(x, groundY + h * 0.45, z), qq, ss.set(r, r * 1.15, r));
    canopies.setMatrixAt(i, tm);
    canopies.setColorAt(i, greens[Math.floor(rnd() * greens.length)]);
  });
  trunks.castShadow = true; canopies.castShadow = true; canopies.receiveShadow = true;
  layers.trees.add(trunks, canopies); root.add(layers.trees);

  // lamp posts along avenues
  const lampPts = [];
  for (const r of campus.roads) if (r.class === 'avenue' || r.class === 'ring') {
    const pts = r.points; for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L; for (let s = 12; s < L - 6; s += 36) for (const side of [-1, 1]) lampPts.push([a[0] + (b[0] - a[0]) * s / L + nx * side * (r.width / 2 + 4.2), a[1] + (b[1] - a[1]) * s / L + nz * side * (r.width / 2 + 4.2)]); }
  }
  const lampOk = lampPts.filter(([x, z]) => free(x, z, 1.5, 1.4));
  const poleG = new THREE.CylinderGeometry(0.12, 0.16, 6, 6); poleG.translate(0, 3, 0);
  const poles = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: '#5b626d', roughness: 0.6 }), lampOk.length);
  const bulbG = new THREE.SphereGeometry(0.42, 10, 8); const bulbMat = new THREE.MeshStandardMaterial({ color: '#fffbe9', emissive: '#000000' });
  const bulbs = new THREE.InstancedMesh(bulbG, bulbMat, lampOk.length); glow.push({ mat: bulbMat, on: '#ffe7a8', strength: 2.2 });
  lampOk.forEach(([x, z], i) => { tm.makeTranslation(x, 0, z); poles.setMatrixAt(i, tm); tm.makeTranslation(x, 6.2, z); bulbs.setMatrixAt(i, tm); });
  poles.castShadow = true; layers.lamps.add(poles, bulbs); root.add(layers.lamps);

  // routing-graph debug overlay (hidden by default)
  {
    const pos = []; const col = []; const kc = { sidewalk: [0.2, 0.55, 1], footpath: [0.1, 0.8, 0.5], plaza: [0.9, 0.7, 0.1], crossing: [1, 0.3, 0.3], entrance: [0.8, 0.4, 1] };
    for (const e of edges) { const a = nodes.get(e.a), b = nodes.get(e.b), c = kc[e.kind] || [1, 1, 1]; pos.push(a.x, 1.2, a.z, b.x, 1.2, b.z); col.push(...c, ...c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true })); lines.renderOrder = 20; layers.graph.add(lines);
    const sg = new THREE.SphereGeometry(1.1, 8, 6); const nm = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: '#ff4d6d', depthTest: false }), nodes.size); let i = 0;
    for (const n of nodes.values()) { tm.makeScale(n.kind === 'entrance' ? 1.6 : 1, n.kind === 'entrance' ? 1.6 : 1, n.kind === 'entrance' ? 1.6 : 1); tm.setPosition(n.x, 1.2, n.z); nm.setMatrixAt(i++, tm); }
    nm.renderOrder = 21; layers.graph.add(nm); layers.graph.visible = false; root.add(layers.graph);
  }

  return {
    root, pickables, placeObjects, layers, bounds, updaters, ground,
    setDusk(on) {
      for (const g of glow) {
        g.mat.emissive.set(on ? g.on : (g.dayOn ?? '#000000'));
        g.mat.emissiveIntensity = on ? (g.strength ?? 0.9) : (g.dayStrength ?? 0);
      }
      for (const s of cuSignLights) s.setDusk(on);
    },
    update(t) { for (const u of updaters) u(t); },
  };
}
