import * as THREE from '../vendor/three/three.module.min.js';
import { Geo } from './world.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDist = (m) => (m === Infinity || m === null || m === undefined ? '∞' : `${Number(m).toFixed(1)} m`);

export class DijkstraVisualizer {
  constructor(stage, world) {
    this.stage = stage;
    this.world = world;
    this.group = new THREE.Group();
    this.group.visible = false;
    stage.scene.add(this.group);

    this.trace = [];
    this.route = null;
    this.stepIndex = 0;
    this.playing = false;
    this.speed = 1.0; // steps multiplier: 1x = ~2 steps/sec, 2x = 4 steps/sec, etc.
    this.stepInterval = 500; // base ms per step at 1x
    this.lastStepTime = 0;

    // 3D Visual elements
    this.settledNodesGroup = new THREE.Group();
    this.treeLinesGroup = new THREE.Group();
    this.group.add(this.settledNodesGroup);
    this.group.add(this.treeLinesGroup);

    // Active node marker (pulsing gold/amber)
    const activeGeo = new THREE.SphereGeometry(2.2, 20, 16);
    const activeMat = new THREE.MeshStandardMaterial({
      color: '#ffc531',
      emissive: '#ff9800',
      emissiveIntensity: 0.9,
      roughness: 0.2
    });
    this.activeNodeMesh = new THREE.Mesh(activeGeo, activeMat);
    this.activeNodeMesh.position.y = 2.2;
    this.activeNodeMesh.visible = false;

    // Pulsing halo ring for active node
    const haloGeo = new THREE.RingGeometry(3.5, 4.8, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: '#ffc531',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.activeHalo = new THREE.Mesh(haloGeo, haloMat);
    this.activeHalo.rotation.x = -Math.PI / 2;
    this.activeHalo.position.y = 0.6;
    this.activeNodeMesh.add(this.activeHalo);
    this.group.add(this.activeNodeMesh);

    // Candidate relaxation edge line
    const relaxMat = new THREE.LineBasicMaterial({
      color: '#ff4081',
      linewidth: 3,
      transparent: true,
      opacity: 0.95
    });
    const relaxGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.relaxLine = new THREE.Line(relaxGeo, relaxMat);
    this.relaxLine.visible = false;
    this.group.add(this.relaxLine);

    // Final path highlight ribbon
    this.finalPathGroup = new THREE.Group();
    this.finalPathGroup.visible = false;
    this.group.add(this.finalPathGroup);

    // Reusable materials
    this.settledMat = new THREE.MeshStandardMaterial({
      color: '#10b981',
      emissive: '#059669',
      emissiveIntensity: 0.6,
      roughness: 0.3
    });
    this.inPqMat = new THREE.MeshStandardMaterial({
      color: '#3b82f6',
      emissive: '#1d4ed8',
      emissiveIntensity: 0.5,
      roughness: 0.4
    });
    this.nodeGeo = new THREE.SphereGeometry(1.2, 14, 10);
    this.treeMat = new THREE.LineBasicMaterial({
      color: '#60a5fa',
      transparent: true,
      opacity: 0.4,
      linewidth: 1.5
    });

    // Node coordinate lookup: id -> [x, z]
    this.nodePosMap = new Map();

    // DOM Panel
    this.panel = document.getElementById('visualizerPanel');
    this.setupUI();

    // Per-frame animation for pulsing effects and playback loop
    stage.onFrame((t, dt) => this.onFrame(t, dt));
  }

  setupUI() {
    if (!this.panel) return;
    this.dom = {
      closeBtn: this.panel.querySelector('#visCloseBtn'),
      playBtn: this.panel.querySelector('#visPlayBtn'),
      stepBackBtn: this.panel.querySelector('#visStepBackBtn'),
      stepFwdBtn: this.panel.querySelector('#visStepFwdBtn'),
      resetBtn: this.panel.querySelector('#visResetBtn'),
      scrubber: this.panel.querySelector('#visScrubber'),
      speedBtns: this.panel.querySelectorAll('[data-speed]'),
      stepCounter: this.panel.querySelector('#visStepCounter'),
      typeBadge: this.panel.querySelector('#visTypeBadge'),
      eventText: this.panel.querySelector('#visEventText'),
      statVisited: this.panel.querySelector('#visStatVisited'),
      statPqSize: this.panel.querySelector('#visStatPqSize'),
      statCost: this.panel.querySelector('#visStatCost'),
      pqTableBody: this.panel.querySelector('#visPqTable tbody'),
      distTableBody: this.panel.querySelector('#visDistTable tbody'),
      tabBtns: this.panel.querySelectorAll('.vis-tab-btn'),
      tabPanes: this.panel.querySelectorAll('.vis-tab-pane'),
    };

    this.dom.closeBtn?.addEventListener('click', () => this.hide());
    this.dom.playBtn?.addEventListener('click', () => this.togglePlay());
    this.dom.stepBackBtn?.addEventListener('click', () => this.stepBack());
    this.dom.stepFwdBtn?.addEventListener('click', () => this.stepForward());
    this.dom.resetBtn?.addEventListener('click', () => this.goToStep(0));

    this.dom.scrubber?.addEventListener('input', (e) => {
      this.pause();
      this.goToStep(Number(e.target.value));
    });

    this.dom.speedBtns?.forEach((b) => {
      b.addEventListener('click', () => {
        this.dom.speedBtns.forEach((btn) => btn.classList.remove('active'));
        b.classList.add('active');
        this.speed = parseFloat(b.dataset.speed) || 1.0;
      });
    });

    this.dom.tabBtns?.forEach((b) => {
      b.addEventListener('click', () => {
        const tab = b.dataset.tab;
        this.dom.tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
        this.dom.tabPanes.forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
      });
    });
  }

  show(routeResult, campus) {
    if (!routeResult || !routeResult.trace || !routeResult.trace.length) {
      console.warn('DijkstraVisualizer: routeResult contains no trace events');
      return;
    }

    this.route = routeResult;
    this.trace = routeResult.trace;
    this.stepIndex = 0;
    this.playing = false;
    this.updatePlayBtn();

    // Build node coordinate map
    this.nodePosMap.clear();
    if (campus && campus.graph && campus.graph.nodes) {
      for (const n of campus.graph.nodes) {
        this.nodePosMap.set(n.id, [n.x, n.z]);
      }
    }
    // Also include any virtual or snapped nodes from trace
    for (const ts of this.trace) {
      if (ts.node && ts.point) this.nodePosMap.set(ts.node, ts.point);
      if (ts.neighbor && ts.neighborPoint) this.nodePosMap.set(ts.neighbor, ts.neighborPoint);
    }

    // Build final path geometry for highlight
    this.buildFinalPathGeometry(routeResult.geometry);

    // Update scrubber range
    if (this.dom.scrubber) {
      this.dom.scrubber.min = 0;
      this.dom.scrubber.max = this.trace.length - 1;
      this.dom.scrubber.value = 0;
    }

    this.group.visible = true;
    this.panel.hidden = false;
    this.panel.classList.add('open');

    // Go to first step
    this.goToStep(0);
  }

  hide() {
    this.pause();
    this.group.visible = false;
    if (this.panel) {
      this.panel.hidden = true;
      this.panel.classList.remove('open');
    }
    if (this.onCloseCallback) this.onCloseCallback();
  }

  onClose(cb) {
    this.onCloseCallback = cb;
  }

  buildFinalPathGeometry(geometry) {
    while (this.finalPathGroup.children.length > 0) {
      const o = this.finalPathGroup.children[0];
      o.geometry?.dispose();
      o.material?.dispose?.();
      this.finalPathGroup.remove(o);
    }

    if (!geometry || geometry.length < 2) return;
    const g = new Geo();
    g.polyline(geometry, 4.0, 0.45, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: '#10b981',
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = g.mesh(mat, { receive: false, order: 20 });
    this.finalPathGroup.add(mesh);
  }

  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  }

  play() {
    if (this.stepIndex >= this.trace.length - 1) {
      this.goToStep(0);
    }
    this.playing = true;
    this.lastStepTime = performance.now();
    this.updatePlayBtn();
  }

  pause() {
    this.playing = false;
    this.updatePlayBtn();
  }

  updatePlayBtn() {
    if (!this.dom.playBtn) return;
    if (this.playing) {
      this.dom.playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg><span>Pause</span>`;
      this.dom.playBtn.classList.add('is-playing');
    } else {
      this.dom.playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5v14l11-7z" fill="currentColor"/></svg><span>Play</span>`;
      this.dom.playBtn.classList.remove('is-playing');
    }
  }

  stepForward() {
    this.pause();
    if (this.stepIndex < this.trace.length - 1) {
      this.goToStep(this.stepIndex + 1);
    }
  }

  stepBack() {
    this.pause();
    if (this.stepIndex > 0) {
      this.goToStep(this.stepIndex - 1);
    }
  }

  onFrame(t, dt) {
    if (!this.group.visible) return;

    // Pulse active halo ring
    if (this.activeHalo && this.activeNodeMesh.visible) {
      const k = 1 + 0.22 * Math.sin(t * 6);
      this.activeHalo.scale.set(k, k, 1);
      this.activeHalo.material.opacity = 0.5 + 0.35 * Math.sin(t * 6);
      this.activeNodeMesh.position.y = 2.2 + 0.3 * Math.sin(t * 4);
    }

    // Playback loop
    if (this.playing) {
      const now = performance.now();
      const interval = Math.max(25, this.stepInterval / this.speed);
      if (now - this.lastStepTime >= interval) {
        this.lastStepTime = now;
        if (this.stepIndex < this.trace.length - 1) {
          this.goToStep(this.stepIndex + 1);
        } else {
          this.pause();
        }
      }
    }
  }

  /**
   * Evaluates the Dijkstra state up to index targetStep by fast-replaying
   * the trace events. This is instantaneous (< 1ms) and perfectly consistent.
   */
  computeStateAt(targetStep) {
    const dist = new Map(); // nodeId -> distance
    const prev = new Map(); // nodeId -> prevNodeId
    const settled = new Set(); // set of settled nodeIds
    let pq = []; // simulated min-heap: array of { dist, node, prev }
    let reachedGoal = false;
    let finalCost = null;

    for (let i = 0; i <= targetStep && i < this.trace.length; i++) {
      const ev = this.trace[i];
      switch (ev.type) {
        case 'init': {
          dist.set(ev.node, ev.currentDist ?? 0);
          pq.push({ dist: ev.currentDist ?? 0, node: ev.node, prev: null });
          pq.sort((a, b) => a.dist - b.dist || a.node.localeCompare(b.node));
          break;
        }
        case 'pop': {
          // Remove the matching item from simulated pq
          const idx = pq.findIndex((item) => item.node === ev.node && Math.abs(item.dist - ev.currentDist) < 1e-4);
          if (idx !== -1) pq.splice(idx, 1);
          break;
        }
        case 'skip': {
          // Already settled or stale entry
          break;
        }
        case 'settle': {
          settled.add(ev.node);
          dist.set(ev.node, ev.currentDist);
          break;
        }
        case 'relax': {
          dist.set(ev.neighbor, ev.newDist);
          if (ev.node) prev.set(ev.neighbor, ev.node);
          pq.push({ dist: ev.newDist, node: ev.neighbor, prev: ev.node });
          pq.sort((a, b) => a.dist - b.dist || a.node.localeCompare(b.node));
          break;
        }
        case 'reach_goal': {
          reachedGoal = true;
          settled.add(ev.node);
          finalCost = ev.currentDist;
          break;
        }
        case 'done': {
          finalCost = ev.currentDist;
          break;
        }
      }
    }

    return { dist, prev, settled, pq, reachedGoal, finalCost };
  }

  goToStep(targetStep) {
    this.stepIndex = Math.max(0, Math.min(this.trace.length - 1, targetStep));
    const ev = this.trace[this.stepIndex];
    const state = this.computeStateAt(this.stepIndex);

    // Update scrubber
    if (this.dom.scrubber) this.dom.scrubber.value = this.stepIndex;

    // Update 3D scene elements
    this.update3DScene(ev, state);

    // Update UI tables and stats
    this.updateDOM(ev, state);
  }

  update3DScene(ev, state) {
    // 1. Settled nodes & in-PQ nodes
    while (this.settledNodesGroup.children.length > 0) {
      const o = this.settledNodesGroup.children[0];
      o.geometry?.dispose();
      this.settledNodesGroup.remove(o);
    }

    const pqNodeSet = new Set(state.pq.map((p) => p.node));

    // Render settled nodes (green spheres)
    for (const nodeId of state.settled) {
      const pt = this.nodePosMap.get(nodeId);
      if (!pt) continue;
      const m = new THREE.Mesh(this.nodeGeo, this.settledMat);
      m.position.set(pt[0], 0.7, pt[1]);
      this.settledNodesGroup.add(m);
    }

    // Render in-PQ nodes (blue spheres)
    for (const nodeId of pqNodeSet) {
      if (state.settled.has(nodeId)) continue;
      const pt = this.nodePosMap.get(nodeId);
      if (!pt) continue;
      const m = new THREE.Mesh(this.nodeGeo, this.inPqMat);
      m.position.set(pt[0], 0.6, pt[1]);
      this.settledNodesGroup.add(m);
    }

    // 2. Explored tree lines (connecting settled/discovered nodes to predecessors)
    while (this.treeLinesGroup.children.length > 0) {
      const o = this.treeLinesGroup.children[0];
      o.geometry?.dispose();
      this.treeLinesGroup.remove(o);
    }

    const linePositions = [];
    for (const [nodeId, prevNodeId] of state.prev.entries()) {
      const p1 = this.nodePosMap.get(prevNodeId);
      const p2 = this.nodePosMap.get(nodeId);
      if (p1 && p2) {
        linePositions.push(p1[0], 0.5, p1[1]);
        linePositions.push(p2[0], 0.5, p2[1]);
      }
    }
    if (linePositions.length > 0) {
      const treeGeo = new THREE.BufferGeometry();
      treeGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      const treeLines = new THREE.LineSegments(treeGeo, this.treeMat);
      this.treeLinesGroup.add(treeLines);
    }

    // 3. Active node marker
    if (ev.point) {
      this.activeNodeMesh.position.set(ev.point[0], 2.2, ev.point[1]);
      this.activeNodeMesh.visible = true;
    } else {
      this.activeNodeMesh.visible = false;
    }

    // 4. Candidate relaxation edge line
    if (ev.type === 'relax' && ev.point && ev.neighborPoint) {
      const pts = [
        new THREE.Vector3(ev.point[0], 0.8, ev.point[1]),
        new THREE.Vector3(ev.neighborPoint[0], 0.8, ev.neighborPoint[1])
      ];
      this.relaxLine.geometry.setFromPoints(pts);
      this.relaxLine.visible = true;
    } else {
      this.relaxLine.visible = false;
    }

    // 5. Final path highlight ribbon
    const isFinished = state.reachedGoal || ev.type === 'reach_goal' || ev.type === 'done' || this.stepIndex === this.trace.length - 1;
    this.finalPathGroup.visible = isFinished;
  }

  updateDOM(ev, state) {
    if (!this.dom.stepCounter) return;

    // Step counter & Progress
    this.dom.stepCounter.textContent = `${this.stepIndex + 1} / ${this.trace.length}`;

    // Badge styling & event text description
    const badge = this.dom.typeBadge;
    let badgeText = ev.type.toUpperCase();
    let badgeClass = 'badge-default';
    let description = '';

    switch (ev.type) {
      case 'init':
        badgeText = 'INIT';
        badgeClass = 'badge-init';
        description = `Initialize source <b>${esc(ev.node)}</b> with tentative distance <b>0.0 m</b> into priority queue.`;
        break;
      case 'pop':
        badgeText = 'EXTRACT-MIN';
        badgeClass = 'badge-pop';
        description = `Extract min node <b>${esc(ev.node)}</b> from priority queue with tentative distance <b>${fmtDist(ev.currentDist)}</b>.`;
        break;
      case 'skip':
        badgeText = 'SKIP';
        badgeClass = 'badge-skip';
        description = `Node <b>${esc(ev.node)}</b> (distance ${fmtDist(ev.currentDist)}) was already settled with a shorter path. Skipping.`;
        break;
      case 'settle':
        badgeText = 'SETTLE';
        badgeClass = 'badge-settle';
        description = `Node <b>${esc(ev.node)}</b> distance <b>${fmtDist(ev.currentDist)}</b> finalized. Marked as visited.`;
        break;
      case 'relax':
        badgeText = 'RELAX';
        badgeClass = 'badge-relax';
        description = `Relax edge <b>${esc(ev.node)}</b> → <b>${esc(ev.neighbor)}</b>: ${fmtDist(ev.oldDist)} &gt; <b>${fmtDist(ev.newDist)}</b> (edge cost: ${fmtDist(ev.edgeCost)}). Predecessor updated.`;
        break;
      case 'reach_goal':
        badgeText = 'GOAL REACHED';
        badgeClass = 'badge-goal';
        description = `🎉 Destination <b>${esc(ev.node)}</b> popped from priority queue with optimal distance <b>${fmtDist(ev.currentDist)}</b>!`;
        break;
      case 'done':
        badgeText = 'DONE';
        badgeClass = 'badge-done';
        description = `Dijkstra search complete. Final optimal shortest path distance: <b>${fmtDist(ev.currentDist)}</b>.`;
        break;
    }

    badge.className = `vis-badge ${badgeClass}`;
    badge.textContent = badgeText;
    this.dom.eventText.innerHTML = description;

    // Stats bar
    this.dom.statVisited.textContent = `${state.settled.size}`;
    this.dom.statPqSize.textContent = `${ev.pqSize ?? state.pq.length}`;
    const cost = state.finalCost ?? (this.route ? this.route.distance : 0);
    this.dom.statCost.textContent = fmtDist(cost);

    // Priority Queue table (top 15 items in min-heap)
    const pqRows = state.pq.slice(0, 15).map((item, idx) => `
      <tr class="${idx === 0 ? 'pq-min' : ''}">
        <td>#${idx + 1}</td>
        <td><code>${esc(item.node)}</code></td>
        <td class="num">${fmtDist(item.dist)}</td>
        <td><code>${esc(item.prev || '–')}</code></td>
      </tr>
    `).join('');
    this.dom.pqTableBody.innerHTML = pqRows || '<tr><td colspan="4" class="empty">Priority queue is empty</td></tr>';

    // Tentative Distances table (active / settled nodes)
    const distEntries = Array.from(state.dist.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, 20);

    const distRows = distEntries.map(([nodeId, d]) => {
      const isSettled = state.settled.has(nodeId);
      const isCurrent = nodeId === ev.node;
      return `
        <tr class="${isCurrent ? 'dist-current' : isSettled ? 'dist-settled' : ''}">
          <td><code>${esc(nodeId)}</code></td>
          <td class="num">${fmtDist(d)}</td>
          <td><code>${esc(state.prev.get(nodeId) || '–')}</code></td>
          <td><span class="vis-tag ${isSettled ? 'tag-settled' : 'tag-pq'}">${isSettled ? 'Settled' : 'In PQ'}</span></td>
        </tr>
      `;
    }).join('');
    this.dom.distTableBody.innerHTML = distRows || '<tr><td colspan="4" class="empty">No tentative distances</td></tr>';
  }
}
