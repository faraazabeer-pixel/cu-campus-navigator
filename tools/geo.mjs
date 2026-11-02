// Shared planar-geometry helpers. Coordinates are metres in the campus-local
// frame: x = east, z = south (so north is -z, matching Three.js' default camera).
export const EPS = 1e-9;

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const mul = (a, s) => [a[0] * s, a[1] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const norm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function polylineLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

/** Project p onto segment ab. Returns {point, t, d}. */
export function projectToSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  let t = l2 < EPS ? 0 : dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = [a[0] + ab[0] * t, a[1] + ab[1] * t];
  return { point, t, d: dist(p, point) };
}

/** Proper intersection of segments ab and cd (excluding shared end points). */
export function segmentIntersection(a, b, c, d) {
  const r = sub(b, a), s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < EPS) return null; // parallel / collinear
  const qp = sub(c, a);
  const t = cross(qp, s) / den;
  const u = cross(qp, r) / den;
  const e = 1e-7;
  if (t <= e || t >= 1 - e || u <= e || u >= 1 - e) return null;
  return { point: [a[0] + r[0] * t, a[1] + r[1] * t], t, u };
}

export function polygonArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function polygonCentroid(poly) {
  let cx = 0, cz = 0, A = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const f = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * f; cz += (a[1] + b[1]) * f; A += f;
  }
  if (Math.abs(A) < EPS) return poly[0];
  return [cx / (3 * A), cz / (3 * A)];
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function bbox(pts) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return { x0, z0, x1, z1 };
}

/** Distance from point to polygon boundary (0 if inside). */
export function distPointToPolygon(p, poly) {
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, projectToSegment(p, poly[i], poly[(i + 1) % poly.length]).d);
  return best;
}

/** True when two simple polygons overlap (edge crossing or containment). */
export function polygonsOverlap(A, B) {
  const ba = bbox(A), bb = bbox(B);
  if (ba.x1 < bb.x0 || bb.x1 < ba.x0 || ba.z1 < bb.z0 || bb.z1 < ba.z0) return false;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      if (segmentIntersection(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
    }
  }
  return pointInPolygon(A[0], B) || pointInPolygon(B[0], A);
}

/** Minimum distance between a polygon and a polyline. */
export function distPolygonToPolyline(poly, line) {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    if (pointInPolygon(line[i], poly)) return 0;
    for (let j = 0; j < poly.length; j++) {
      const c = poly[j], d = poly[(j + 1) % poly.length];
      if (segmentIntersection(line[i], line[i + 1], c, d)) return 0;
      best = Math.min(best, projectToSegment(c, line[i], line[i + 1]).d, projectToSegment(line[i], c, d).d, projectToSegment(line[i + 1], c, d).d);
    }
  }
  return best;
}

/** Oriented rectangle centred at (cx,cz). rot in degrees (clockwise when viewed from above, +x east/+z south). */
export function rect(cx, cz, w, d, rotDeg = 0) {
  const r = (rotDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
    .map(([x, z]) => [round(cx + x * c - z * s), round(cz + x * s + z * c)]);
}

export function ellipse(cx, cz, rx, rz, n = 32, rotDeg = 0) {
  const r = (rotDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, z = Math.sin(a) * rz;
    pts.push([round(cx + x * c - z * s), round(cz + x * s + z * c)]);
  }
  return pts;
}

export function round(v, p = 3) { const k = 10 ** p; return Math.round(v * k) / k; }

/** Offset an open polyline by `off` metres to its left (negative = right) using mitred joins. Left is relative to travel direction in x-east/z-south coordinates (i.e. visually left when looking from above with north up). */
export function offsetPolyline(pts, off) {
  const n = pts.length;
  const normals = [];
  for (let i = 0; i + 1 < n; i++) {
    const d = norm(sub(pts[i + 1], pts[i]));
    // visual left on a north-up map where z points south: rotate direction by -90deg in (x,z)
    normals.push([d[1], -d[0]]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) out.push(add(pts[0], mul(normals[0], off)));
    else if (i === n - 1) out.push(add(pts[i], mul(normals[n - 2], off)));
    else {
      const n1 = normals[i - 1], n2 = normals[i];
      const m = norm(add(n1, n2));
      const k = 1 / Math.max(0.35, dot(m, n1));
      out.push(add(pts[i], mul(m, off * k)));
    }
  }
  return out.map((p) => [round(p[0]), round(p[1])]);
}

// ---- Geodesy (local tangent-plane approximation; error < 5 cm over 2 km) ----
const M_PER_DEG_LAT = 111320;
export function enuToLatLon(origin, x, z) {
  return { lat: origin.lat - z / M_PER_DEG_LAT, lon: origin.lon + x / (M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180)) };
}
export function latLonToEnu(origin, lat, lon) {
  return [(lon - origin.lon) * M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180), -(lat - origin.lat) * M_PER_DEG_LAT];
}
