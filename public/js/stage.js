// Renderer, camera, orbit controls, lighting and camera tweens.
import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/addons/controls/OrbitControls.js';
import * as T from './textures.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrapPI = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Stage {
  constructor(container, bounds) {
    this.container = container; this.bounds = bounds;
    this.cx = (bounds.x0 + bounds.x1) / 2; this.cz = (bounds.z0 + bounds.z1) / 2;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.camera = new THREE.PerspectiveCamera(45, 1, 2, 14000);
    this.controls = new OrbitControls(this.camera, this.canvas);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.08,
      rotateSpeed: 0.72,
      zoomSpeed: 1.0,
      panSpeed: 1.1,
      screenSpacePanning: false,
      minDistance: 18,
      maxDistance: 2400,
      maxPolarAngle: 1.44,
      zoomToCursor: true
    });
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.listenToKeyEvents(window); this.controls.keyPanSpeed = 40;
    this.controls.addEventListener('change', () => { this.dirty = true; this.#clampTarget(); });

    // 3D atmospheric sky dome & drifting cloud dome (fog: false so sky gradient & clouds remain crisp)
    this.skyDomeGeo = new THREE.SphereGeometry(6200, 48, 28);
    this.skyDomeMat = new THREE.MeshBasicMaterial({ map: T.skyDomeTexture(false), side: THREE.BackSide, depthWrite: false, fog: false });
    this.skyDome = new THREE.Mesh(this.skyDomeGeo, this.skyDomeMat);
    this.skyDome.position.set(this.cx, 0, this.cz);
    this.scene.add(this.skyDome);

    this.cloudDomeGeo = new THREE.SphereGeometry(6100, 32, 16);
    this.cloudDomeMat = new THREE.MeshBasicMaterial({ map: T.cloudRingTexture(), side: THREE.BackSide, depthWrite: false, transparent: true, opacity: 0.55, fog: false });
    this.cloudDome = new THREE.Mesh(this.cloudDomeGeo, this.cloudDomeMat);
    this.cloudDome.position.set(this.cx, 0, this.cz);
    this.scene.add(this.cloudDome);

    // Natural daylight illumination with warm sunlight, dual-tone hemisphere and soft ambient fill
    this.hemi = new THREE.HemisphereLight('#60a4ea', '#5b7a48', 0.95);
    this.scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight('#8faecc', 0.25);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight('#fff6e8', 1.85);
    const R = Math.max(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0) * 0.68;
    this.sun.position.set(this.cx - 450, 750, this.cz + 550);
    this.sun.target.position.set(this.cx, 0, this.cz);
    Object.assign(this.sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 100, far: 2400 });
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(innerWidth < 700 ? 2048 : 4096, innerWidth < 700 ? 2048 : 4096);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.5;
    this.scene.add(this.sun, this.sun.target);
    this.dusk = false; this.#applyTheme();

    this.frameCbs = []; this.tween = null; this.clock = new THREE.Clock(); this.dirty = true; this.paused = false;
    this.dragMode = 'rotate'; // 'rotate' | 'pan'
    this.spaceDown = false;
    this.trackpadScrollAction = 'pan'; // 'pan' | 'zoom'

    this.resize(); new ResizeObserver(() => this.resize()).observe(container);
    this.resetView(false);
    this.#setupMousepadControls();
    this._loop = this._loop.bind(this); requestAnimationFrame(this._loop);
    document.addEventListener('visibilitychange', () => {
      // Don't pause during automated screenshot capture or headless evaluation
      if (navigator.webdriver || window.__capturing) return;
      this.paused = document.hidden;
      if (!this.paused) this.clock.getDelta();
    });
  }
  _loop() {
    requestAnimationFrame(this._loop);
    if (this.paused) return;
    const dt = Math.min(this.clock.getDelta(), 0.1), t = this.clock.elapsedTime;
    if (this.tween) this.#stepTween(dt);
    this.controls.update();
    if (this.skyDome) this.skyDome.position.copy(this.camera.position);
    if (this.cloudDome) {
      this.cloudDome.position.copy(this.camera.position);
      this.cloudDome.rotation.y += dt * 0.0025;
    }
    for (const cb of this.frameCbs) cb(t, dt);
    this.renderer.render(this.scene, this.camera);
    this.frames = (this.frames || 0) + 1;
  }
  onFrame(cb) { this.frameCbs.push(cb); }
  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    // keep the scene centred in the free area right of the planner panel on wide screens
    const off = w > 900 ? 196 : 0;
    if (off) this.camera.setViewOffset(w, h, -off, 0, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix(); this.w = w; this.h = h; this.dirty = true;
  }
  #clampTarget() {
    const t = this.controls.target, m = 160, b = this.bounds;
    t.x = Math.max(b.x0 - m, Math.min(b.x1 + m, t.x)); t.z = Math.max(b.z0 - m, Math.min(b.z1 + m, t.z)); t.y = 0;
  }
  #applyTheme() {
    const skyColor = this.dusk ? '#1d283c' : '#d6e9f8';
    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog = new THREE.Fog(skyColor, this.dusk ? 1500 : 1800, this.dusk ? 5600 : 6000);
    if (this.skyDome) {
      this.skyDome.material.map = T.skyDomeTexture(this.dusk);
      this.skyDome.material.needsUpdate = true;
    }
    if (this.cloudDome) {
      this.cloudDome.material.opacity = this.dusk ? 0.3 : 0.55;
    }
    this.hemi.intensity = this.dusk ? 0.6 : 0.95;
    this.hemi.color.set(this.dusk ? '#6b82be' : '#60a4ea');
    this.hemi.groundColor.set(this.dusk ? '#2c2836' : '#5b7a48');
    this.sun.intensity = this.dusk ? 0.75 : 1.85;
    this.sun.color.set(this.dusk ? '#ff9a5e' : '#fff6e8');
    if (this.ambient) {
      this.ambient.intensity = this.dusk ? 0.2 : 0.25;
      this.ambient.color.set(this.dusk ? '#2d3345' : '#8faecc');
    }
    this.renderer.toneMappingExposure = this.dusk ? 0.95 : 0.95;
  }
  setDusk(on) { this.dusk = on; this.#applyTheme(); }

  /** Current camera framing as {x,z,distance,azimuth,polar}. */
  view() {
    const off = new THREE.Vector3().subVectors(this.camera.position, this.controls.target), s = new THREE.Spherical().setFromVector3(off);
    return { x: this.controls.target.x, z: this.controls.target.z, distance: s.radius, azimuth: s.theta, polar: s.phi };
  }
  setView({ x, z, distance, azimuth, polar }) {
    const s = new THREE.Spherical(distance, polar, azimuth), off = new THREE.Vector3().setFromSpherical(s);
    this.controls.target.set(x, 0, z);
    this.camera.position.copy(off).add(this.controls.target);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    if (this.skyDome) this.skyDome.position.copy(this.camera.position);
    if (this.cloudDome) this.cloudDome.position.copy(this.camera.position);
    this.dirty = true;
  }
  flyTo(to, duration = 1.1) {
    const from = this.view(); const az = from.azimuth + wrapPI((to.azimuth ?? from.azimuth) - from.azimuth);
    this.tween = { from, to: { x: to.x ?? from.x, z: to.z ?? from.z, distance: to.distance ?? from.distance, azimuth: az, polar: to.polar ?? from.polar }, t: 0, d: Math.max(0.01, duration) };
    return new Promise((r) => { this.tween.done = r; });
  }
  #stepTween(dt) {
    const tw = this.tween; tw.t += dt / tw.d; const k = ease(Math.min(1, tw.t));
    const l = (a, b) => a + (b - a) * k;
    // interpolate log-distance so zooming feels uniform
    this.setView({ x: l(tw.from.x, tw.to.x), z: l(tw.from.z, tw.to.z), distance: Math.exp(l(Math.log(tw.from.distance), Math.log(tw.to.distance))), azimuth: l(tw.from.azimuth, tw.to.azimuth), polar: l(tw.from.polar, tw.to.polar) });
    if (tw.t >= 1) { const d = tw.done; this.tween = null; d && d(); }
  }
  cancelTween() { if (this.tween) { const d = this.tween.done; this.tween = null; d && d(); } }
  resetView(animate = true) { const v = { x: -10, z: -50, distance: 680, azimuth: 0.03, polar: 1.30 }; return animate ? this.flyTo(v, 1.2) : this.setView(v); }
  topView() { return this.flyTo({ polar: 0.001, azimuth: 0, distance: Math.max(this.view().distance, 700) }, 0.9); }
  fitBox(x0, z0, x1, z1, { pad = 1.35, polar = 0.9, azimuth } = {}) {
    const w = (x1 - x0) * pad, h = (z1 - z0) * pad, fov = (this.camera.fov * Math.PI) / 180;
    const dz = h / 2 / Math.tan(fov / 2) / Math.cos(Math.min(polar, 1.2) * 0.6), dx = w / 2 / Math.tan(fov / 2) / this.camera.aspect;
    return this.flyTo({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, distance: Math.max(90, dz, dx), polar, azimuth }, 1.2);
  }
  /** Project a world point to CSS pixels. */
  project(x, y, z, out = new THREE.Vector3()) { out.set(x, y, z).project(this.camera); return { x: (out.x * 0.5 + 0.5) * this.w, y: (-out.y * 0.5 + 0.5) * this.h, visible: out.z > -1 && out.z < 1 }; }
  /** Pointer position -> ray. */
  ray(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect(); const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, this.camera); return rc;
  }

  /* ------------------------------------------------------------------ mousepad & gesture navigation */
  zoomIn(factor = 1.35) {
    const v = this.view();
    return this.flyTo({ ...v, distance: Math.max(this.controls.minDistance + 10, v.distance / factor) }, 0.35);
  }
  zoomOut(factor = 1.35) {
    const v = this.view();
    return this.flyTo({ ...v, distance: Math.min(this.controls.maxDistance - 100, v.distance * factor) }, 0.35);
  }
  setDragMode(mode) {
    this.dragMode = mode === 'pan' ? 'pan' : 'rotate';
    if (this.dragMode === 'pan') {
      this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
      this.canvas.style.cursor = 'grab';
    } else {
      this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      this.canvas.style.cursor = '';
    }
    return this.dragMode;
  }
  toggleDragMode() {
    return this.setDragMode(this.dragMode === 'pan' ? 'rotate' : 'pan');
  }

  /**
   * Applies smooth zoom centered at (clientX, clientY).
   * zoomRatio > 1.0 => ZOOM IN (magnify, camera moves closer, distance decreases)
   * zoomRatio < 1.0 => ZOOM OUT (demagnify, camera pulls back, distance increases)
   */
  #applyZoom(zoomRatio, clientX, clientY) {
    if (clientX !== undefined && clientY !== undefined) {
      this.controls._updateZoomParameters(clientX, clientY);
    }
    // In OrbitControls: radius = radius * this._scale
    // Therefore, to zoom in (decrease radius), _scale must be < 1.0 (1 / zoomRatio).
    // To zoom out (increase radius), _scale must be > 1.0 (1 / zoomRatio).
    this.controls._scale /= zoomRatio;
    this.controls.update();
    this.dirty = true;
  }

  #setupMousepadControls() {
    // 1. Pinch to zoom on trackpad (Wheel with ctrlKey in Chrome/Firefox/Safari)
    // and trackpad 2-finger swipe to pan
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.tween) this.cancelTween();

      // Trackpad natural pinch gesture (browsers fire wheel with ctrlKey = true):
      // - Pinch fingers apart (e.deltaY < 0) -> ZOOM IN (magnify, camera moves closer)
      // - Pinch fingers together (e.deltaY > 0) -> ZOOM OUT (camera pulls back)
      if (e.ctrlKey) {
        const delta = Math.max(-60, Math.min(60, e.deltaY));
        const zoomRatio = Math.exp(-delta * 0.012);
        this.#applyZoom(zoomRatio, e.clientX, e.clientY);
        return;
      }

      // Shift + wheel: horizontal pan
      if (e.shiftKey) {
        const panX = (e.deltaX !== 0 ? e.deltaX : e.deltaY) * 0.95;
        this.controls._pan(panX, 0);
        this.controls.update();
        this.dirty = true;
        return;
      }

      // Check if this is a physical mouse wheel (discrete notched steps) vs continuous trackpad swipe
      const isPhysicalMouseWheel = (e.deltaMode !== 0) || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));

      if (isPhysicalMouseWheel || this.trackpadScrollAction === 'zoom') {
        // Smooth responsive mouse wheel zoom focused towards cursor:
        // Rolling forward/up (deltaY < 0) -> zoom in
        // Rolling backward/down (deltaY > 0) -> zoom out
        const steps = Math.min(3, Math.max(1, Math.abs(e.deltaY) / 60));
        const zoomRatio = e.deltaY < 0 ? Math.pow(1.09, steps) : Math.pow(0.91, steps);
        this.#applyZoom(zoomRatio, e.clientX, e.clientY);
      } else {
        // Trackpad 2-finger swipe -> smooth ground pan without interfering with camera rotation
        const panSpeed = 0.95;
        this.controls._pan(e.deltaX * panSpeed, e.deltaY * panSpeed);
        this.controls.update();
        this.dirty = true;
      }
    }, { passive: false, capture: true });

    // 2. Safari native gesture events (gesturestart / gesturechange / gestureend)
    let gestureScale = 1.0;
    this.canvas.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      gestureScale = 1.0;
      this.controls._updateZoomParameters(e.clientX, e.clientY);
    }, { passive: false });

    this.canvas.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (!e.scale) return;
      const ratio = e.scale / gestureScale;
      gestureScale = e.scale;
      // In Safari:
      // Pinch fingers apart (ratio > 1.0) -> ZOOM IN (zoomRatio > 1.0)
      // Pinch fingers together (ratio < 1.0) -> ZOOM OUT (zoomRatio < 1.0)
      const zoomRatio = ratio;
      this.#applyZoom(zoomRatio, e.clientX, e.clientY);
    }, { passive: false });

    this.canvas.addEventListener('gestureend', (e) => {
      e.preventDefault();
    }, { passive: false });

    // Touchscreens: pinch fingers apart = zoom in, pinch fingers together = zoom out
    this.controls._handleTouchMoveDolly = (event) => {
      const position = this.controls._getSecondPointerPosition(event);
      if (!position) return;
      const dx = event.pageX - position.x;
      const dy = event.pageY - position.y;
      const distance = Math.hypot(dx, dy);
      this.controls._dollyEnd.set(0, distance);
      const ratio = this.controls._dollyEnd.y / this.controls._dollyStart.y;
      // Fingers apart (ratio > 1) -> scale < 1 (_scale decreases, zooms in)
      // Fingers together (ratio < 1) -> scale > 1 (_scale increases, zooms out)
      const scale = Math.pow(1 / ratio, this.controls.zoomSpeed);
      this.controls._scale *= scale;
      this.controls._dollyStart.copy(this.controls._dollyEnd);
      const centerX = (event.pageX + position.x) * 0.5;
      const centerY = (event.pageY + position.y) * 0.5;
      this.controls._updateZoomParameters(centerX, centerY);
    };

    // Prevent Safari from zooming the entire webpage viewport on pinch
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });

    // 3. Double click to zoom in to clicked position (Shift+double click to zoom out)
    this.canvas.addEventListener('dblclick', (e) => {
      const rc = this.ray(e.clientX, e.clientY);
      const hit = rc.intersectObject(this.scene, true)[0];
      const cur = this.view();
      const zoomFactor = e.shiftKey ? 1.55 : 0.55;
      const targetDist = Math.max(this.controls.minDistance + 10, Math.min(this.controls.maxDistance - 100, cur.distance * zoomFactor));
      const targetX = hit && !e.shiftKey ? (cur.x * 0.4 + hit.point.x * 0.6) : cur.x;
      const targetZ = hit && !e.shiftKey ? (cur.z * 0.4 + hit.point.z * 0.6) : cur.z;
      this.flyTo({
        x: targetX,
        z: targetZ,
        distance: targetDist,
        polar: cur.polar,
        azimuth: cur.azimuth
      }, 0.55);
    });

    // 4. Spacebar pan mode (hold Space to drag/pan with left click)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && !this.spaceDown) {
        this.spaceDown = true;
        this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        this.canvas.style.cursor = 'grab';
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && this.spaceDown) {
        this.spaceDown = false;
        if (this.dragMode === 'rotate') {
          this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
          this.canvas.style.cursor = '';
        }
      }
    });

    this.canvas.addEventListener('pointerdown', () => {
      if (this.spaceDown || this.dragMode === 'pan') {
        this.canvas.style.cursor = 'grabbing';
      }
    });
    this.canvas.addEventListener('pointerup', () => {
      if (this.spaceDown || this.dragMode === 'pan') {
        this.canvas.style.cursor = 'grab';
      }
    });

    // 5. Keyboard navigation (WASD / Arrows pan, QE rotate, RF tilt, +- zoom)
    window.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      const panSpeed = 35;
      if (k === 'w' || e.key === 'ArrowUp') {
        this.controls._pan(0, -panSpeed);
        this.controls.update();
        this.dirty = true;
      } else if (k === 's' || e.key === 'ArrowDown') {
        this.controls._pan(0, panSpeed);
        this.controls.update();
        this.dirty = true;
      } else if (k === 'a' || e.key === 'ArrowLeft') {
        this.controls._pan(-panSpeed, 0);
        this.controls.update();
        this.dirty = true;
      } else if (k === 'd' || e.key === 'ArrowRight') {
        this.controls._pan(panSpeed, 0);
        this.controls.update();
        this.dirty = true;
      } else if (k === 'q') {
        const v = this.view();
        this.setView({ ...v, azimuth: v.azimuth + 0.12 });
      } else if (k === 'e') {
        const v = this.view();
        this.setView({ ...v, azimuth: v.azimuth - 0.12 });
      } else if (k === 'r') {
        const v = this.view();
        this.setView({ ...v, polar: Math.max(0.05, v.polar - 0.08) });
      } else if (k === 'f') {
        const v = this.view();
        this.setView({ ...v, polar: Math.min(1.42, v.polar + 0.08) });
      } else if (e.key === '+' || e.key === '=') {
        this.zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        this.zoomOut();
      }
    });
  }
}
