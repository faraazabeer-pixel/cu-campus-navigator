// HTML labels projected over the 3D scene, with priority-based collision culling.
import { CATEGORY_STYLE } from './world.js';

const BASE = { gate: 95, landmark: 85, library: 80, food: 78, sports: 72, auditorium: 70, hostel: 66, admin: 64, medical: 60, bank: 50, academic: 55, parking: 30 };

export class Labels {
  constructor(container, stage, world, campus, onPick) {
    this.stage = stage; this.container = container; this.items = []; this.visible = true; this.state = { start: null, end: null, selected: null };
    for (const p of campus.places) {
      const el = document.createElement('button'); el.type = 'button'; el.className = `lbl cat-${p.kind}`; el.dataset.id = p.id;
      const dot = document.createElement('i'); const span = document.createElement('span'); span.textContent = p.name.replace(/\s*\(.*?\)/, '');
      el.append(dot, span); el.title = p.name; el.addEventListener('click', (e) => { e.stopPropagation(); onPick(p.id); });
      container.appendChild(el);
      const top = world.placeObjects.get(p.id)?.userData.top ?? p.height;
      const prio = (BASE[p.kind] || 50) + (p.nameConfidence === 'verified' ? 8 : 0) + Math.min(10, p.height / 4);
      this.items.push({ p, el, x: p.centroid[0], y: Math.max(top, 2) + 3, z: p.centroid[1], prio, w: 0, h: 0 });
      el.style.setProperty('--c', (CATEGORY_STYLE[p.kind] || CATEGORY_STYLE.academic).accent);
    }
    this.measure = true;
  }
  setVisible(v) { this.visible = v; this.container.style.display = v ? '' : 'none'; }
  setState(s) { Object.assign(this.state, s); for (const it of this.items) { const id = it.p.id; it.el.classList.toggle('is-start', id === this.state.start); it.el.classList.toggle('is-end', id === this.state.end); it.el.classList.toggle('is-selected', id === this.state.selected); } }
  update() {
    if (!this.visible) return;
    const dist = this.stage.view().distance;
    const budget = dist > 1500 ? 7 : dist > 1000 ? 14 : dist > 600 ? 26 : 99;
    if (this.measure) { for (const it of this.items) { it.el.style.visibility = 'hidden'; it.el.style.display = ''; } for (const it of this.items) { const r = it.el.getBoundingClientRect(); it.w = r.width; it.h = r.height; } this.measure = false; }
    const projected = [];
    for (const it of this.items) {
      const pr = this.stage.project(it.x, it.y, it.z);
      const pinned = it.p.id === this.state.start || it.p.id === this.state.end || it.p.id === this.state.selected;
      const on = pr.visible && pr.x > -40 && pr.x < this.stage.w + 40 && pr.y > 40 && pr.y < this.stage.h + 20;
      projected.push({ it, pr, on, pinned, score: (pinned ? 1000 : 0) + it.prio });
    }
    projected.sort((a, b) => b.score - a.score);
    const placed = []; let n = 0;
    for (const q of projected) {
      const { it, pr } = q; let show = q.on && (q.pinned || n < budget);
      let box = null;
      if (show) {
        box = { x0: pr.x - it.w / 2 - 3, x1: pr.x + it.w / 2 + 3, y0: pr.y - it.h - 3, y1: pr.y + 3 };
        if (!q.pinned && placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) show = false;
      }
      if (show) { placed.push(box); n++; it.el.style.visibility = 'visible'; it.el.style.transform = `translate3d(${(pr.x - it.w / 2).toFixed(1)}px, ${(pr.y - it.h).toFixed(1)}px, 0)`; it.el.style.zIndex = String(Math.round(q.score)); }
      else it.el.style.visibility = 'hidden';
    }
  }
}
