// Procedural canvas textures (no image assets, so nothing to license or download).
import * as THREE from '../vendor/three/three.module.min.js';

const make = (w, h, draw, { repeat = false, srgb = true, anisotropy = 4 } = {}) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy; t.needsUpdate = true;
  return t;
};

/** One façade cell = 4 m wide x 3.6 m tall (one storey). Returns {map, emissive}. */
export function facadeTextures() {
  const W = 128, H = 116;
  const base = (lit) => (ctx) => {
    ctx.fillStyle = lit ? '#000' : '#ffffff'; ctx.fillRect(0, 0, W, H);
    if (!lit) { // wall detail: spandrel band + faint panel seams
      ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(0, H - 22, W, 22);
      ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(0, 0, 2, H);
    }
    const x = 14, y = 16, w = W - 28, h = 58;
    if (lit) { ctx.fillStyle = '#ffd89a'; ctx.fillRect(x, y, w, h); return; }
    ctx.fillStyle = '#35506b'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);         // frame
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#b9d4ea'); g.addColorStop(1, '#6f95b4');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.45, y); ctx.lineTo(x + w * 0.62, y); ctx.lineTo(x + w * 0.17, y + h); ctx.fill(); // glare
    ctx.fillStyle = '#35506b'; ctx.fillRect(x + w / 2 - 1.5, y, 3, h);          // mullion
  };
  return { map: make(W, H, base(false), { repeat: true, anisotropy: 8 }), emissive: make(W, H, base(true), { repeat: true }) };
}

export function stripeTexture(a, b, n = 8, w = 128, h = 128) { // mowing stripes
  return make(w, h, (ctx) => { for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? a : b; ctx.fillRect(0, (i * h) / n, w, h / n + 1); } });
}

export function dashTexture() { // road centre line
  return make(8, 64, (ctx, w, h) => { ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#f5f1e4'; ctx.fillRect(0, 4, w, 28); }, { repeat: true, srgb: true });
}

export function chevronTexture() { // animated route arrows
  return make(64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.moveTo(10, 50); ctx.lineTo(32, 16); ctx.lineTo(54, 50); ctx.lineTo(54, 38); ctx.lineTo(32, 4); ctx.lineTo(10, 38); ctx.closePath(); ctx.fill();
  }, { repeat: true });
}

export function plazaTexture() {
  return make(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#e4d9c4'; ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    for (let r = 250, i = 0; r > 20; r -= 24, i++) { ctx.strokeStyle = i % 2 ? 'rgba(160,140,110,0.35)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
    for (let a = 0; a < 16; a++) { ctx.rotate(Math.PI / 8); ctx.strokeStyle = 'rgba(160,140,110,0.28)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(250, 0); ctx.stroke(); }
  });
}

export function footballTexture() {
  return make(512, 320, (ctx, w, h) => {
    for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#4f9a45' : '#58a74c'; ctx.fillRect((i * w) / 12, 0, w / 12 + 1, h); }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, w - 28, h - 28); ctx.beginPath(); ctx.moveTo(w / 2, 14); ctx.lineTo(w / 2, h - 14); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect(14, h / 2 - 70, 70, 140); ctx.strokeRect(w - 84, h / 2 - 70, 70, 140);
  });
}

export function courtTexture(type) {
  return make(512, 288, (ctx, w, h) => {
    if (type === 'basketball') {
      ctx.fillStyle = '#b9633b'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, w - 20, h - 20); ctx.beginPath(); ctx.moveTo(w / 2, 10); ctx.lineTo(w / 2, h - 10); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 36, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeRect(10, h / 2 - 50, 90, 100); ctx.strokeRect(w - 100, h / 2 - 50, 90, 100);
      ctx.beginPath(); ctx.arc(100, h / 2, 50, -Math.PI / 2, Math.PI / 2); ctx.stroke(); ctx.beginPath(); ctx.arc(w - 100, h / 2, 50, Math.PI / 2, (3 * Math.PI) / 2); ctx.stroke();
    } else if (type === 'tennis') {
      ctx.fillStyle = '#3d7f5f'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#2f6a8a'; ctx.fillRect(40, 30, w - 80, h - 60);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(60, 50, w - 120, h - 100); ctx.beginPath(); ctx.moveTo(w / 2, 50); ctx.lineTo(w / 2, h - 50); ctx.stroke();
      ctx.strokeRect(120, 90, w - 240, h - 180); ctx.beginPath(); ctx.moveTo(120, h / 2); ctx.lineTo(w - 120, h / 2); ctx.stroke();
    } else {
      ctx.fillStyle = '#c9a85a'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(24, 24, w - 48, h - 48);
      ctx.beginPath(); ctx.moveTo(w / 2, 24); ctx.lineTo(w / 2, h - 24); ctx.stroke(); ctx.strokeRect(24, 24, 120, h - 48); ctx.strokeRect(w - 144, 24, 120, h - 48);
    }
  });
}

export function poolTexture() {
  return make(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#dfe7ea'; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2aa8d8'); g.addColorStop(1, '#1b86c0');
    ctx.fillStyle = g; ctx.fillRect(14, 14, w - 28, h - 28);
    const lanes = 8, lh = (h - 28) / lanes;
    for (let i = 1; i < lanes; i++) { ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.75)' : 'rgba(255,200,60,0.75)'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(14, 14 + i * lh); ctx.lineTo(w - 14, 14 + i * lh); ctx.stroke(); }
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(8,60,100,0.6)'; ctx.lineWidth = 3;
    for (let i = 0; i < lanes; i++) { ctx.beginPath(); ctx.moveTo(40, 14 + (i + 0.5) * lh); ctx.lineTo(w - 40, 14 + (i + 0.5) * lh); ctx.stroke(); }
  });
}

export function parkingTexture() {
  return make(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5b6068'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
    for (let r = 0; r < 2; r++) for (let i = 0; i <= 12; i++) { const x = 14 + (i * (w - 28)) / 12; ctx.beginPath(); ctx.moveTo(x, r ? h - 14 : 14); ctx.lineTo(x, r ? h - 84 : 84); ctx.stroke(); }
  });
}

export function labelGradient(top, bottom) {
  return make(2, 64, (ctx, w, h) => { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bottom); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); });
}

export function signTexture(text) {
  return make(512, 96, (ctx, w, h) => {
    ctx.fillStyle = '#1d2f4d'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#fff'; ctx.font = '700 44px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

/** Realistic architectural illuminated red "CHANDIGARH UNIVERSITY" roof sign texture */
export function cuSignTexture() {
  const W = 2048, H = 256;
  return make(W, H, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = '900 134px "Arial Black", "Montserrat", "Impact", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = 'CHANDIGARH UNIVERSITY';
    
    // Dark red depth/extrusion shadow
    ctx.fillStyle = '#5c0307';
    ctx.fillText(text, w / 2, h / 2 + 6);
    ctx.fillText(text, w / 2, h / 2 + 4);
    
    // Bold stroke for architectural letter return thickness
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#78040a';
    ctx.strokeText(text, w / 2, h / 2 + 1);
    
    // Vivid rich crimson red letter face
    ctx.fillStyle = '#e8141f';
    ctx.fillText(text, w / 2, h / 2);
    
    // Vibrant bright red acrylic core highlight
    ctx.font = '900 130px "Arial Black", "Montserrat", "Impact", system-ui, sans-serif';
    ctx.fillStyle = '#ff2e3b';
    ctx.fillText(text, w / 2, h / 2 - 1);
  });
}

/** 360-degree atmospheric sky dome with realistic gradient, volumetric cumulus clouds and sun flare */
export function skyDomeTexture(dusk = false) {
  const W = 2048, H = 1024;
  return make(W, H, (ctx, w, h) => {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (!dusk) {
      skyGrad.addColorStop(0.00, '#0a4b92'); // Deep vibrant royal azure zenith
      skyGrad.addColorStop(0.18, '#145eb5');
      skyGrad.addColorStop(0.32, '#2879d6');
      skyGrad.addColorStop(0.42, '#4596e8');
      skyGrad.addColorStop(0.46, '#70b2ee');
      skyGrad.addColorStop(0.49, '#a8d5f6');
      skyGrad.addColorStop(0.50, '#cce6f8'); // Horizon at 50% (matches fog)
      skyGrad.addColorStop(0.53, '#b8dbf2'); // Horizon blend band
      skyGrad.addColorStop(0.70, '#a0c8e2'); // Nadir ground haze
      skyGrad.addColorStop(1.00, '#8cb8d4');
    } else {
      skyGrad.addColorStop(0.00, '#090e1c'); // Night twilight zenith
      skyGrad.addColorStop(0.20, '#16203a');
      skyGrad.addColorStop(0.36, '#382246');
      skyGrad.addColorStop(0.43, '#82323e');
      skyGrad.addColorStop(0.47, '#ce602c');
      skyGrad.addColorStop(0.495, '#f59e52');
      skyGrad.addColorStop(0.50, '#f5a65b'); // Horizon sunset gold
      skyGrad.addColorStop(0.53, '#3a242f'); // Dusk ground haze
      skyGrad.addColorStop(0.70, '#1d1722');
      skyGrad.addColorStop(1.00, '#100d14');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Sun flare & corona (positioned South at w*0.25, matching the directional sunlight source behind camera)
    const sunX = w * 0.25, sunY = h * 0.26;
    if (!dusk) {
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 260);
      sunGrad.addColorStop(0.0, 'rgba(255, 255, 245, 0.85)');
      sunGrad.addColorStop(0.15, 'rgba(255, 245, 215, 0.45)');
      sunGrad.addColorStop(0.40, 'rgba(235, 245, 255, 0.15)');
      sunGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath(); ctx.arc(sunX, sunY, 260, 0, Math.PI * 2); ctx.fill();
    } else {
      const sunDuskGrad = ctx.createRadialGradient(w * 0.25, h * 0.49, 0, w * 0.25, h * 0.49, 260);
      sunDuskGrad.addColorStop(0.0, 'rgba(255, 195, 120, 0.7)');
      sunDuskGrad.addColorStop(0.25, 'rgba(245, 130, 60, 0.32)');
      sunDuskGrad.addColorStop(1.0, 'rgba(200, 70, 40, 0)');
      ctx.fillStyle = sunDuskGrad;
      ctx.beginPath(); ctx.arc(w * 0.25, h * 0.49, 260, 0, Math.PI * 2); ctx.fill();
    }

    // Realistic distinct cumulus cloud formations with rich blue sky in between
    const rnd = (seed) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const rand = rnd(42);
    const numClusters = 22; // Spaced out layered clouds
    for (let c = 0; c < numClusters; c++) {
      const cx = (c / numClusters) * w + (rand() - 0.5) * 80;
      const cy = h * (0.22 + rand() * 0.22);
      const clusterRadius = 40 + rand() * 70;
      const puffs = 7 + Math.floor(rand() * 9);

      for (let p = 0; p < puffs; p++) {
        const px = cx + (rand() - 0.5) * clusterRadius * 2.2;
        const py = cy + (rand() - 0.5) * clusterRadius * 0.45;
        const pr = (clusterRadius * 0.35) * (0.6 + rand() * 0.85);

        const cloudGrad = ctx.createRadialGradient(px, py - pr * 0.22, pr * 0.08, px, py, pr);
        if (!dusk) {
          cloudGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.98)');
          cloudGrad.addColorStop(0.50, 'rgba(245, 250, 255, 0.80)');
          cloudGrad.addColorStop(0.80, 'rgba(205, 228, 248, 0.38)');
          cloudGrad.addColorStop(1.0, 'rgba(180, 212, 238, 0)');
        } else {
          cloudGrad.addColorStop(0.0, 'rgba(255, 200, 150, 0.88)');
          cloudGrad.addColorStop(0.5, 'rgba(220, 120, 105, 0.62)');
          cloudGrad.addColorStop(0.85, 'rgba(95, 55, 85, 0.32)');
          cloudGrad.addColorStop(1.0, 'rgba(40, 25, 45, 0)');
        }
        ctx.fillStyle = cloudGrad;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();

        // Seam wrapping
        if (px - pr < 0) {
          ctx.beginPath(); ctx.arc(px + w, py, pr, 0, Math.PI * 2); ctx.fill();
        } else if (px + pr > w) {
          ctx.beginPath(); ctx.arc(px - w, py, pr, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }, { repeat: true, srgb: true });
}

/** Secondary drifting cloud layer */
export function cloudRingTexture() {
  const W = 1024, H = 512;
  return make(W, H, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const rnd = (seed) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const rand = rnd(99);
    for (let c = 0; c < 14; c++) {
      const cx = (c / 14) * w + (rand() - 0.5) * 60;
      const cy = h * (0.30 + rand() * 0.16);
      const rad = 40 + rand() * 60;
      const puffs = 6 + Math.floor(rand() * 8);
      for (let p = 0; p < puffs; p++) {
        const px = cx + (rand() - 0.5) * rad * 2.2;
        const py = cy + (rand() - 0.5) * rad * 0.5;
        const pr = rad * 0.35 * (0.5 + rand() * 0.7);
        const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
        g.addColorStop(0.0, 'rgba(255, 255, 255, 0.35)');
        g.addColorStop(0.6, 'rgba(250, 252, 255, 0.16)');
        g.addColorStop(1.0, 'rgba(240, 245, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
        if (px - pr < 0) { ctx.beginPath(); ctx.arc(px + w, py, pr, 0, Math.PI * 2); ctx.fill(); }
        else if (px + pr > w) { ctx.beginPath(); ctx.arc(px - w, py, pr, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  }, { repeat: true, srgb: true });
}

/** Seamless natural turf texture with multi-scale organic mottling */
export function grassTexture() {
  const W = 512, H = 512;
  return make(W, H, (ctx, w, h) => {
    // Vibrant, lush campus lawn green matching official reference
    ctx.fillStyle = '#5c8e45'; ctx.fillRect(0, 0, w, h);
    const colors = ['#53833d', '#65994d', '#6ea455', '#4d7c37', '#5a8b42'];
    const rnd = (seed) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const rand = rnd(1234);
    for (let i = 0; i < 50; i++) {
      const px = rand() * w, py = rand() * h, pr = 35 + rand() * 70;
      const col = colors[Math.floor(rand() * colors.length)];
      const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(92, 142, 69, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    }
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rand() - 0.5) * 18;
      d[i] = Math.max(0, Math.min(255, d[i] + n * 0.7));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.5));
    }
    ctx.putImageData(imgData, 0, 0);
  }, { repeat: true, srgb: true, anisotropy: 8 });
}

/** Regional lush agricultural landscape texture for surrounding terrain */
export function countrysideTexture() {
  const W = 1024, H = 1024;
  return make(W, H, (ctx, w, h) => {
    ctx.fillStyle = '#568640'; ctx.fillRect(0, 0, w, h);
    const rnd = (seed) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const rand = rnd(888);

    const tones = [
      '#4e7d38', '#5a8b42', '#63964b', '#487533', '#52833c',
      '#5e9146', '#699e50', '#3e652a', '#446e2f', '#609348'
    ];

    for (let i = 0; i < 48; i++) {
      const fx = rand() * w, fy = rand() * h;
      const fw = 120 + rand() * 220, fh = 90 + rand() * 180;
      const col = tones[Math.floor(rand() * tones.length)];
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(fx, fy, fw, fh, 24) : ctx.fillRect(fx, fy, fw, fh);
      ctx.fill();

      if (rand() > 0.4) {
        ctx.strokeStyle = 'rgba(40, 68, 25, 0.45)';
        ctx.lineWidth = 4 + rand() * 4;
        ctx.stroke();
      }

      if (rand() > 0.5) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.035)';
        const stripeW = 8 + rand() * 12;
        for (let s = 0; s < fw; s += stripeW * 2) {
          ctx.fillRect(fx + s, fy, stripeW, fh);
        }
      }
    }

    for (let i = 0; i < 60; i++) {
      const gx = rand() * w, gy = rand() * h, gr = 20 + rand() * 45;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, 'rgba(42, 70, 28, 0.65)');
      g.addColorStop(0.7, 'rgba(54, 88, 36, 0.4)');
      g.addColorStop(1, 'rgba(86, 134, 64, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill();
    }

    ctx.strokeStyle = 'rgba(164, 150, 126, 0.55)';
    ctx.lineWidth = 5;
    for (let r = 0; r < 4; r++) {
      ctx.beginPath();
      ctx.moveTo(0, rand() * h);
      ctx.bezierCurveTo(w * 0.3, rand() * h, w * 0.7, rand() * h, w, rand() * h);
      ctx.stroke();
    }

    const overlay = ctx.createLinearGradient(0, 0, w, h);
    overlay.addColorStop(0, 'rgba(95, 145, 70, 0.12)');
    overlay.addColorStop(1, 'rgba(75, 120, 55, 0.18)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, w, h);
  }, { repeat: true, srgb: true, anisotropy: 8 });
}

/** Main Ground cricket stadium turf with concentric mowing passes and pitch */
export function cricketTexture() {
  const W = 512, H = 512;
  return make(W, H, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, maxR = 246, rings = 14;
    for (let r = rings; r >= 1; r--) {
      ctx.fillStyle = r % 2 === 0 ? '#639b4b' : '#71a957';
      ctx.beginPath(); ctx.arc(cx, cy, (r * maxR) / rings, 0, Math.PI * 2); ctx.fill();
    }
    // Crisp white boundary rope
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, 230, 0, Math.PI * 2); ctx.stroke();
    // 30-yard fielding circle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.arc(cx, cy, 140, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // Central clay cricket pitch
    const pitchW = 34, pitchH = 110;
    ctx.fillStyle = '#d5c08d'; ctx.fillRect(cx - pitchW / 2, cy - pitchH / 2, pitchW, pitchH);
    ctx.strokeStyle = '#bba46e'; ctx.lineWidth = 1.5; ctx.strokeRect(cx - pitchW / 2, cy - pitchH / 2, pitchW, pitchH);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - pitchW / 2 + 3, cy - pitchH / 2 + 16); ctx.lineTo(cx + pitchW / 2 - 3, cy - pitchH / 2 + 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - pitchW / 2 + 3, cy + pitchH / 2 - 16); ctx.lineTo(cx + pitchW / 2 - 3, cy + pitchH / 2 - 16); ctx.stroke();
  }, { srgb: true, anisotropy: 8 });
}

/** Roadway asphalt texture with aggregate grain and subtle lane wear */
export function asphaltTexture() {
  const W = 256, H = 256;
  return make(W, H, (ctx, w, h) => {
    ctx.fillStyle = '#454950'; ctx.fillRect(0, 0, w, h);
    const rnd = (seed) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const rand = rnd(5432);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = (rand() - 0.5) * 20;
      d[i] = Math.max(0, Math.min(255, d[i] + g));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + g));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + g));
    }
    ctx.putImageData(imgData, 0, 0);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillRect(w * 0.2, 0, w * 0.15, h);
    ctx.fillRect(w * 0.65, 0, w * 0.15, h);
  }, { repeat: true, srgb: true, anisotropy: 8 });
}

/** Athletic running track with terracotta surface and lane markers */
export function runningTrackTexture() {
  const W = 512, H = 256;
  return make(W, H, (ctx, w, h) => {
    ctx.fillStyle = '#b6513a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; ctx.lineWidth = 2.5;
    const lanes = 6;
    for (let i = 0; i <= lanes; i++) {
      const y = (i * h) / lanes;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }, { repeat: true, srgb: true });
}
