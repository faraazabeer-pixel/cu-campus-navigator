// Draws the computed route in 3D: glowing animated ribbon, A/B pins, a walking dot, step focus and a fly-through.
import * as THREE from '../vendor/three/three.module.min.js';
import { Geo } from './world.js';
import * as T from './textures.js';

const mkPin = (color) => {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7, 4.6, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.4 })); cone.rotation.x = Math.PI; cone.position.y = 2.3;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.35 })); ball.position.y = 6.2;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff' })); dot.position.y = 6.5; dot.position.z = 1.9; dot.scale.set(1, 1, 0.3);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.2, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.5;
  g.add(cone, ball, ring); g.userData = { ring, ball, dot }; g.traverse((o) => { o.castShadow = o !== ring; }); return g;
};

export class RouteView {
  constructor(stage) {
    this.stage = stage; this.group = new THREE.Group(); this.group.visible = false; stage.scene.add(this.group);
    this.chev = T.chevronTexture(); this.chev.repeat.set(1, 1);
    this.pinA = mkPin('#17a673'); this.pinB = mkPin('#f0572d'); this.group.add(this.pinA, this.pinB);
    this.walker = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#2f5bff', emissiveIntensity: 0.9 })); this.walker.position.y = 1.8; this.group.add(this.walker);
    this.stepRing = new THREE.Mesh(new THREE.RingGeometry(4, 5.2, 40), new THREE.MeshBasicMaterial({ color: '#ffc531', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); this.stepRing.rotation.x = -Math.PI / 2; this.stepRing.visible = false; this.stepRing.renderOrder = 30; this.group.add(this.stepRing);
    this.line = null; this.pts = []; this.cum = []; this.total = 0; this.fly = null; this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    stage.onFrame((t, dt) => this.#update(t, dt));
    const stop = () => this.stopFlythrough(); stage.canvas.addEventListener('pointerdown', stop); stage.canvas.addEventListener('wheel', stop, { passive: true });
  }
  clear() {
    this.stopFlythrough(); this.group.visible = false; this.stepRing.visible = false;
    if (this.line) { this.group.remove(this.line); this.line.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); this.line = null; }
    this.pts = []; this.cum = []; this.total = 0;
  }
  show(geometry) {
    this.clear(); this.pts = geometry.map(([x, z]) => new THREE.Vector2(x, z));
    this.cum = [0]; for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1])); this.total = this.cum[this.cum.length - 1] || 0;
    const line = new THREE.Group(); const raw = geometry;
    const mk = (w, y, mat, order, period) => { const g = new Geo(); g.polyline(raw, w, y, period); const m = g.mesh(mat, { receive: false, order }); m.castShadow = false; return m; };
    const off = (f) => ({ polygonOffset: true, polygonOffsetFactor: -f, polygonOffsetUnits: -f, side: THREE.DoubleSide, depthWrite: false });
    line.add(mk(9, 0.30, new THREE.MeshBasicMaterial({ color: '#5f8bff', transparent: true, opacity: 0.22, ...off(10) }), 10, 0));
    line.add(mk(4.8, 0.34, new THREE.MeshBasicMaterial({ color: '#0b2a8f', ...off(12) }), 11, 0));
    line.add(mk(3.5, 0.38, new THREE.MeshBasicMaterial({ color: '#2f6bff', ...off(14) }), 12, 0));
    this.chevMat = new THREE.MeshBasicMaterial({ map: this.chev, transparent: true, ...off(16) });
    line.add(mk(3.0, 0.42, this.chevMat, 13, 6));
    this.line = line; this.group.add(line);
    const a = this.pts[0], b = this.pts[this.pts.length - 1];
    this.pinA.position.set(a.x, 0, a.y); this.pinB.position.set(b.x, 0, b.y); this.group.visible = true; this.walkT = 0;
  }
  bbox() { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const p of this.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.y); z1 = Math.max(z1, p.y); } return { x0, z0, x1, z1 }; }
  fit() { const b = this.bbox(); return this.stage.fitBox(b.x0, b.z0, b.x1, b.z1, { pad: 1.5, polar: 0.85 }); }
  at(d) { // position & heading at distance d along the route
    d = Math.max(0, Math.min(this.total, d)); let i = 1; while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const a = this.pts[i - 1] || this.pts[0], b = this.pts[i] || a, seg = Math.max(1e-6, this.cum[i] - this.cum[i - 1] || 1e-6), k = (d - (this.cum[i - 1] || 0)) / seg;
    return { x: a.x + (b.x - a.x) * k, z: a.y + (b.y - a.y) * k, heading: Math.atan2(b.x - a.x, b.y - a.y) };
  }
  focusPoint(x, z, distance = 120) { this.stepRing.position.set(x, 0.6, z); this.stepRing.visible = true; return this.stage.flyTo({ x, z, distance, polar: 0.95 }, 0.9); }
  hideStepRing() { this.stepRing.visible = false; }
  startFlythrough(onEnd) {
    if (this.total < 1) return; this.stopFlythrough(); this.fly = { d: 0, onEnd, heading: null, speed: Math.max(45, this.total / 18) }; this.stage.cancelTween(); this.stage.controls.enabled = false;
  }
  stopFlythrough() { if (!this.fly) return; const cb = this.fly.onEnd; this.fly = null; this.stage.controls.enabled = true; cb && cb(); }
  get flying() { return !!this.fly; }
  #update(t, dt) {
    if (!this.group.visible) return;
    if (this.chevMat) this.chev.offset.y -= dt * 0.9;
    for (const pin of [this.pinA, this.pinB]) { const k = (t * 1.2) % 1; pin.userData.ring.scale.setScalar(1 + k * 0.9); pin.userData.ring.material.opacity = 0.7 * (1 - k); pin.children[1].position.y = 6.2 + Math.sin(t * 2.4) * 0.35; pin.children[2].position.y = pin.children[1].position.y + 0.3; pin.userData.dot.lookAt(this.stage.camera.position); }
    if (this.stepRing.visible) this.stepRing.scale.setScalar(1 + 0.12 * Math.sin(t * 5));
    if (this.fly) {
      this.fly.d += this.fly.speed * dt; const p = this.at(this.fly.d); this.walker.position.set(p.x, 1.8, p.z);
      const look = this.at(this.fly.d + 40); const h = Math.atan2(look.x - p.x, look.z - p.z);
      this.fly.heading = this.fly.heading === null ? h : this.fly.heading + Math.atan2(Math.sin(h - this.fly.heading), Math.cos(h - this.fly.heading)) * Math.min(1, dt * 2.2);
      const back = 70, up = 46; const cam = this.stage.camera; const tx = p.x - Math.sin(this.fly.heading) * back, tz = p.z - Math.cos(this.fly.heading) * back;
      cam.position.lerp(new THREE.Vector3(tx, up, tz), Math.min(1, dt * 3)); this.stage.controls.target.lerp(new THREE.Vector3(p.x, 0, p.z), Math.min(1, dt * 5)); cam.lookAt(this.stage.controls.target);
      if (this.fly.d >= this.total) this.stopFlythrough();
    } else if (!this.reduced && this.total > 0) { this.walkT = (this.walkT + dt * Math.max(25, this.total / 14)) % (this.total + 30); const p = this.at(this.walkT); this.walker.position.set(p.x, 1.8, p.z); this.walker.visible = this.walkT <= this.total; }
    else this.walker.visible = false;
  }
}
