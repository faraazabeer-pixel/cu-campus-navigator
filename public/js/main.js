import * as THREE from '../vendor/three/three.module.min.js';
import { getCampus, route as fetchRoute, health } from './api.js';
import { buildWorld, CATEGORY_STYLE } from './world.js';
import { Stage } from './stage.js';
import { Labels } from './labels.js';
import { RouteView } from './route-view.js';
import { DijkstraVisualizer } from './dijkstra-visualizer.js';
import { buildIndex, searchPlaces } from './search.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const fmtTime = (s) => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? `${m} min walk` : `${Math.floor(m / 60)} h ${m % 60} min walk`; };
const ICON = {
  depart: 'M12 3l7 17-7-4-7 4z', straight: 'M12 20V5m0 0l-5 5m5-5l5 5', left: 'M18 20v-8a4 4 0 0 0-4-4H6m0 0l4-4M6 8l4 4', right: 'M6 20v-8a4 4 0 0 1 4-4h8m0 0l-4-4m4 4l-4 4',
  'slight-left': 'M16 20v-6l-6-6m0 0v5m0-5h5', 'slight-right': 'M8 20v-6l6-6m0 0v5m0-5H9', 'sharp-left': 'M17 4v8H8m0 0l4-4m-4 4l4 4', 'sharp-right': 'M7 4v8h9m0 0l-4-4m4 4l-4 4',
  cross: 'M3 8h18M3 12h18M3 16h18', stairs: 'M4 20h5v-5h5v-5h6', arrive: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21zm0-8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
};
const icon = (m) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[m] || ICON.straight}"/></svg>`;

const state = { from: null, to: null, profile: 'walk', selected: null, pick: null, result: null, seq: 0, minimized: false, lastMobileState: 'half' };
let campus, world, stage, labels, routeView, visualizer, index, placeById;

async function boot() {
  const loading = $('#loading');
  try {
    campus = await getCampus();
    placeById = new Map(campus.places.map((p) => [p.id, p]));
    index = buildIndex(campus.places);
    world = buildWorld(campus);
    stage = new Stage($('#stage'), world.bounds);
    stage.scene.add(world.root);
    stage.onFrame((t) => world.update(t));
    labels = new Labels($('#labels'), stage, world, campus, (id) => selectPlace(id, true));
    routeView = new RouteView(stage);
    visualizer = new DijkstraVisualizer(stage, world);
    visualizer.onClose(() => {
      $('#visMapBtn')?.classList.remove('on');
      $('#mobileVisBtn')?.classList.remove('on');
      if (document.documentElement.dataset.layout === 'mobile') setSheetState('half');
    });
    stage.onFrame(() => { labels.update(); $('#compassNeedle').style.transform = `rotate(${(-stage.view().azimuth * 180) / Math.PI}deg)`; });
    wireUI(); restoreFromHash();
    window.__app = { stage, world, state, campus, routeView, visualizer, labels, THREE, selectPlace, setEndpoint, requestRoute, minimizePanel, restorePanel, toggleMinimizePanel, setMobileView, openVisualizer };
    requestAnimationFrame(() => requestAnimationFrame(() => { loading.classList.add('done'); document.body.dataset.ready = '1'; }));
    const h = await health(); if (!h.ok) showStatus('The C++ routing engine is not running. Build it with "npm run build:engine" and restart the server.', true);
  } catch (e) {
    console.error(e); loading.classList.add('error'); loading.innerHTML = `<p><b>Could not start.</b><br>${esc(e.message || e)}</p>`;
  }
}

/* ------------------------------------------------------------------ endpoints & fields */
const label = (e) => (!e ? '' : e.type === 'place' ? placeById.get(e.id).name : `Map point (${e.x.toFixed(0)}, ${e.z.toFixed(0)})`);
function syncChips() {
  const toId = state.to?.type === 'place' ? state.to.id : null;
  $$('#chips button').forEach((b) => {
    b.classList.toggle('active', b.dataset.chip === toId);
  });
}
function setEndpoint(which, e, { route = true } = {}) {
  state[which] = e; const input = $(`#${which}Input`); input.value = label(e);
  $(`[data-clear="${which}"]`).hidden = !e; syncLabels(); syncChips(); updateHash();
  if (route) requestRoute();
}
function syncLabels() { labels.setState({ start: state.from?.type === 'place' ? state.from.id : null, end: state.to?.type === 'place' ? state.to.id : null }); }
function showStatus(msg, err = false) { const s = $('#status'); s.hidden = !msg; s.textContent = msg || ''; s.classList.toggle('err', err); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.id); toast.id = setTimeout(() => (t.hidden = true), 3600); }

async function requestRoute() {
  const seq = ++state.seq;
  if (!state.from || !state.to) { clearRoute(false); return; }
  showStatus('Finding the shortest walking route…');
  try {
    const isVisOpen = visualizer && visualizer.group.visible;
    const r = await fetchRoute(state.from, state.to, state.profile, isVisOpen);
    if (seq !== state.seq) return;
    showStatus('');
    if (!r.found) { clearRoute(false); showStatus(r.message || 'No route found.', true); return; }
    state.result = r; renderResult(r); routeView.show(r.geometry); routeView.fit(); $('#clearBtn').hidden = false;
    if (isVisOpen && r.trace) visualizer.show(r, campus);
  } catch (e) { if (seq === state.seq) { clearRoute(false); showStatus(`Routing failed: ${e.message}`, true); } }
}
function clearRoute(resetFields) {
  state.result = null; routeView?.clear(); visualizer?.hide(); $('#visMapBtn')?.classList.remove('on'); $('#mobileVisBtn')?.classList.remove('on'); $('#result').hidden = true; $('#steps').innerHTML = ''; updateRestoreBadge();
  const mobSteps = $('#mobileStepsList'); if (mobSteps) mobSteps.innerHTML = '';
  setMobileView('plan');
  syncChips();
  if (resetFields) { state.seq++; setEndpoint('from', null, { route: false }); setEndpoint('to', null, { route: false }); $('#clearBtn').hidden = true; showStatus(''); }
}
function setMobileView(view) {
  const panel = $('#panel');
  if (!panel) return;
  if (view === 'preview') {
    panel.dataset.mobileView = 'preview';
    document.documentElement.dataset.mobileView = 'preview';
    const previewView = $('#mobilePreviewView');
    if (previewView) previewView.hidden = false;
    if (document.documentElement.dataset.layout === 'mobile') {
      setSheetState('half');
    }
  } else {
    delete panel.dataset.mobileView;
    delete document.documentElement.dataset.mobileView;
    const previewView = $('#mobilePreviewView');
    if (previewView) previewView.hidden = true;
  }
}
function renderResult(r) {
  if (document.documentElement.dataset.layout === 'mobile' && getSheetState() === 'collapsed') {
    setSheetState('half');
  }
  $('#result').hidden = false; $('#distBig').textContent = fmtDist(r.distance); $('#timeBig').textContent = `${fmtTime(r.duration)} · ${r.steps.length - 1} steps${r.profile === 'accessible' ? ' · step-free' : ''}`;
  $('#engineNote').textContent = `C++ Dijkstra: ${r.stats.expanded} nodes expanded in ${r.stats.micros} µs. Indicative route on an estimated layout.`;
  updateRestoreBadge();

  // Update mobile dedicated route preview
  const mobDist = $('#mobilePreviewDistBig');
  const mobTime = $('#mobilePreviewTimeSub');
  if (mobDist) mobDist.textContent = fmtDist(r.distance);
  if (mobTime) mobTime.textContent = `${fmtTime(r.duration)} · ${r.steps.length - 1} steps${r.profile === 'accessible' ? ' · step-free' : ''}`;

  const mobSteps = $('#mobileStepsList');
  if (mobSteps) {
    mobSteps.innerHTML = '';
    r.steps.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'mobile-step-card';
      li.tabIndex = 0;
      li.dataset.i = i;
      const stepType = s.maneuver === 'depart' ? 'depart' : (s.maneuver === 'arrive' ? 'arrive' : 'turn');
      li.innerHTML = `
        <div class="mobile-step-icon ${stepType}">${icon(s.maneuver)}</div>
        <div class="mobile-step-inst">${esc(s.instruction)}</div>
        <div class="mobile-step-dist">${s.maneuver === 'arrive' ? '' : fmtDist(s.distance)}</div>
      `;
      li.addEventListener('click', () => {
        $$('.mobile-step-card').forEach((c) => c.classList.toggle('active', +c.dataset.i === i));
        focusStep(i);
      });
      mobSteps.appendChild(li);
    });
  }

  const ol = $('#steps'); ol.innerHTML = '';
  r.steps.forEach((s, i) => {
    const li = document.createElement('li'); li.className = s.maneuver; li.tabIndex = 0; li.dataset.i = i;
    li.innerHTML = `<span class="mi">${icon(s.maneuver)}</span><span>${esc(s.instruction)}</span><span class="d">${s.maneuver === 'arrive' ? '' : fmtDist(s.distance)}</span>`;
    li.addEventListener('click', () => focusStep(i)); li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusStep(i); } if (e.key === 'ArrowDown') li.nextElementSibling?.focus(); if (e.key === 'ArrowUp') li.previousElementSibling?.focus(); });
    ol.appendChild(li);
  });
  ol.scrollTop = 0;
}
function focusStep(i) {
  const s = state.result?.steps[i]; if (!s) return;
  $$('#steps li').forEach((li) => li.classList.toggle('active', +li.dataset.i === i));
  $$('.mobile-step-card').forEach((c) => c.classList.toggle('active', +c.dataset.i === i));
  routeView.stopFlythrough();
  routeView.focusPoint(s.at[0], s.at[1], s.maneuver === 'arrive' ? 90 : 110);
}

/* ------------------------------------------------------------------ search / suggestions */
let sugField = null, sugItems = [], sugIdx = -1;
function renderSuggest(which, q) {
  const ul = $('#suggest'); sugField = which; sugItems = []; ul.innerHTML = '';
  let results;
  if (q.trim()) results = searchPlaces(index, q, 8).map((r) => r.place);
  else results = [...campus.places].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  const add = (html, item) => { const li = document.createElement('li'); li.innerHTML = html; if (item) { li.setAttribute('role', 'option'); li.dataset.idx = sugItems.length; sugItems.push(item); li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(item); }); } else { li.className = 'grp'; li.setAttribute('role', 'presentation'); } ul.appendChild(li); };
  let lastKind = null;
  for (const p of results) {
    if (!q.trim() && p.kind !== lastKind) { add((CATEGORY_STYLE[p.kind]?.label || p.kind), null); lastKind = p.kind; }
    add(`<span class="ico" style="--c:${CATEGORY_STYLE[p.kind]?.accent}">${esc(p.name[0])}</span><span class="nm">${esc(p.name)}</span><span class="ct">${esc(p.kind)}</span>`, { type: 'place', id: p.id });
  }
  if (!results.length) add('<span class="nm" style="color:var(--muted)">No matching place. Try "library", "food" or "gate".</span>', null);
  const field = $(`.field[data-field="${which}"]`); ul.style.top = `${field.offsetTop + field.offsetHeight + 6}px`;
  ul.hidden = false; sugIdx = -1; $$('.field input').forEach((i) => i.setAttribute('aria-expanded', 'false')); $(`#${which}Input`).setAttribute('aria-expanded', 'true');
}
function hideSuggest() { $('#suggest').hidden = true; sugItems = []; sugIdx = -1; $$('.field input').forEach((i) => i.setAttribute('aria-expanded', 'false')); }
function highlight(n) { const lis = $$('#suggest li[role="option"]'); sugIdx = (n + lis.length) % Math.max(1, lis.length); lis.forEach((l, i) => l.setAttribute('aria-selected', String(i === sugIdx))); lis[sugIdx]?.scrollIntoView({ block: 'nearest' }); }
function choose(item) { const which = sugField; hideSuggest(); setEndpoint(which, item); if (item.type === 'place') focusPlace(item.id); }
function focusPlace(id) { const p = placeById.get(id); if (!p || state.result) return; stage.flyTo({ x: p.centroid[0], z: p.centroid[1], distance: 210, polar: 0.95 }, 1.0); }

/* ------------------------------------------------------------------ selection / info card */
function selectPlace(id, fly) {
  state.selected = id; labels.setState({ selected: id }); const p = placeById.get(id); if (!p) return;
  const q = { verified: ['verified', 'Name confirmed by CU pages'], 'type-only': ['type-only', 'Facility type confirmed · label ours'], placeholder: ['placeholder', 'Placeholder name'], osm: ['verified', 'From OpenStreetMap'] }[p.nameConfidence] || ['placeholder', ''];
  const el = $('#info'); el.hidden = false;
  el.innerHTML = `<div class="info-header">
      <div class="info-title-wrap">
        <h2>${esc(p.name)}</h2>
      </div>
      <button class="icon-btn close" aria-label="Close details" title="Close details">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <div class="meta"><span class="tag kind">${esc(p.kind)}</span><span class="tag ${q[0]}">${q[1]}</span><span class="tag geo">${p.geometrySource === 'osm' ? 'Geometry: OSM' : 'Position estimated'}</span></div>
    ${p.note ? `<p class="info-note">${esc(p.note)}</p>` : ''}<div class="btns"><button class="btn-from" data-from><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg><span>Directions from here</span></button><button class="go btn-to" data-to><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5" fill="currentColor"/></svg><span>Directions to here</span></button></div>`;
  $('.close', el).onclick = () => { el.hidden = true; state.selected = null; labels.setState({ selected: null }); };
  $('[data-from]', el).onclick = () => setEndpoint('from', { type: 'place', id });
  $('[data-to]', el).onclick = () => setEndpoint('to', { type: 'place', id });
  if (fly && !state.result) stage.flyTo({ x: p.centroid[0], z: p.centroid[1], distance: 190, polar: 0.95 }, 0.9);
  if (state.pick) { const w = state.pick; endPick(); setEndpoint(w, { type: 'place', id }); }
}

/* ------------------------------------------------------------------ picking on the map */
function startPick(which) { state.pick = which; document.body.classList.add('picking'); $('#pickHint').hidden = false; hideSuggest(); }
function endPick() { state.pick = null; document.body.classList.remove('picking'); $('#pickHint').hidden = true; }
function onStageClick(ev) {
  const rc = stage.ray(ev.clientX, ev.clientY);
  const hit = rc.intersectObjects(world.pickables, false)[0];
  const gh = rc.intersectObject(world.ground, false)[0];
  $('#mapMenu').hidden = true;
  if (hit && (!gh || hit.distance < gh.distance + 0.01)) return selectPlace(hit.object.userData.placeId, false);
  if (!gh) return;
  const pt = { type: 'point', x: Math.round(gh.point.x * 10) / 10, z: Math.round(gh.point.z * 10) / 10 };
  const b = world.bounds; if (pt.x < b.x0 - 50 || pt.x > b.x1 + 50 || pt.z < b.z0 - 50 || pt.z > b.z1 + 50) return;
  if (state.pick) { const w = state.pick; endPick(); setEndpoint(w, pt); return; }
  const m = $('#mapMenu'); m.hidden = false; $('#menuTitle').textContent = `Map point (${pt.x.toFixed(0)}, ${pt.z.toFixed(0)})`;
  m.style.left = `${Math.min(ev.clientX, innerWidth - 170)}px`; m.style.top = `${Math.min(ev.clientY, innerHeight - 130)}px`;
  $('#menuFrom').onclick = () => { m.hidden = true; setEndpoint('from', pt); }; $('#menuTo').onclick = () => { m.hidden = true; setEndpoint('to', pt); };
}

/* ------------------------------------------------------------------ data-quality dialog */
function openDataDialog() {
  const q = campus.meta.quality, nc = q.nameConfidence || {};
  $('#dataContent').innerHTML = `<h2>About this map's data</h2><p style="margin:0;color:var(--muted)">${esc(campus.meta.name)}</p>
  <div class="lead"><b>${esc(campus.meta.status)}.</b> ${esc(q.statement)}</div>
  <h3>What is verified, what is estimated</h3>
  <table><tr><th>Item</th><th>Status</th></tr>
  <tr><td>Campus reference point (30.7668 N, 76.5781 E)</td><td>From the CU virtual-tour page metadata · approximate</td></tr>
  <tr><td>Building / gate <b>names</b></td><td>${nc.verified || 0} confirmed by CU / public pages · ${nc['type-only'] || 0} facility type confirmed but label is ours · ${nc.placeholder || 0} placeholders</td></tr>
  <tr><td>Building positions, footprints, heights</td><td><b>All estimated.</b> No official or surveyed geometry was obtainable.</td></tr>
  <tr><td>Roads &amp; footpath alignment</td><td><b>Estimated.</b> Distances are computed from this geometry, not measured on site.</td></tr>
  <tr><td>Trees, lamps, textures</td><td>Decorative · procedural</td></tr></table>
  <h3>Sources used for names</h3><table>${campus.meta.sources.map((s) => `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></td><td>${esc(s.used)}</td></tr>`).join('')}</table>
  <h3>Replace the estimate with real data</h3>
  <p>The importer converts OpenStreetMap (ODbL) buildings, roads and footpaths into the same schema. Run it on a machine with internet access:</p>
  <pre>npm run import:osm -- --bbox 30.752,76.560,30.782,76.600
npm run build:data -- --source data/source/campus.osm.source.json
npm run build:engine &amp;&amp; npm start</pre>
  <p style="color:var(--muted);font-size:12.5px">Dataset hash <code>${esc(campus.meta.sourceHash)}</code> · ${campus.graph.nodes.length} graph nodes · ${campus.graph.edges.length} edges · ${campus.places.length} places.</p>
  <hr class="credits-sep">
  <div class="project-credits">
    <div class="credits-header">PROJECT DEVELOPED BY</div>
    <div class="credits-grid">
      <div class="credit-card">
        <div class="credit-name">Faraaz Mahboob Abeer</div>
        <div class="credit-reg">Registration No.: 25BCS11486</div>
      </div>
      <div class="credit-card">
        <div class="credit-name">Himanshu Mani Tripathi</div>
        <div class="credit-reg">Registration No.: 25BCS12148</div>
      </div>
    </div>
  </div>`;
  $('#dataDialog').showModal();
}

/* ------------------------------------------------------------------ hash state */
function updateHash() {
  const p = new URLSearchParams(); const ep = (e) => (e.type === 'place' ? e.id : `${e.x},${e.z}`);
  if (state.from) p.set('from', ep(state.from)); if (state.to) p.set('to', ep(state.to)); if (state.profile !== 'walk') p.set('profile', state.profile);
  history.replaceState(null, '', p.toString() ? `#${p}` : location.pathname + location.search);
}
function parseEp(s) { if (!s) return null; if (placeById.has(s)) return { type: 'place', id: s }; const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(s); return m ? { type: 'point', x: +m[1], z: +m[2] } : null; }
function restoreFromHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const q = new URLSearchParams(location.search);
  const view = p.get('view') || q.get('view') || (location.hash === '#c-block' ? 'c-block' : null);
  if (view === 'c-block') {
    $('#panel')?.classList.add('collapsed');
    stage.setView({ x: 250, z: 0, distance: 260, azimuth: 0, polar: 0.001 });
  }
  const f = parseEp(p.get('from')), t = parseEp(p.get('to'));
  if (p.get('profile') === 'accessible') setProfile('accessible', false);
  if (f) setEndpoint('from', f, { route: false }); if (t) setEndpoint('to', t, { route: false }); if (f && t) requestRoute();
}
function setProfile(pf, route = true) { state.profile = pf; $$('.seg button').forEach((b) => { const on = b.dataset.profile === pf; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); updateHash(); if (route) requestRoute(); }

/* ------------------------------------------------------------------ view mode & mobile bottom sheet */
function setSheetState(state) {
  const panel = $('#panel');
  if (!panel) return;
  panel.classList.remove('sheet-collapsed', 'sheet-half', 'sheet-expanded', 'collapsed');
  if (state === 'collapsed') {
    panel.classList.add('sheet-collapsed', 'collapsed');
  } else if (state === 'expanded') {
    panel.classList.add('sheet-expanded');
  } else {
    panel.classList.add('sheet-half');
  }
}

function getSheetState() {
  const panel = $('#panel');
  if (!panel) return 'half';
  if (panel.classList.contains('sheet-collapsed') || panel.classList.contains('collapsed')) return 'collapsed';
  if (panel.classList.contains('sheet-expanded')) return 'expanded';
  return 'half';
}

function updateMinBtnIcon(isMin) {
  const minBtn = $('#minPanelBtn');
  if (!minBtn) return;
  if (isMin) {
    minBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
    minBtn.title = 'Restore panel';
    minBtn.setAttribute('aria-label', 'Restore control panel');
  } else {
    minBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>';
    minBtn.title = 'Minimize panel';
    minBtn.setAttribute('aria-label', 'Minimize control panel');
  }
}

function updateRestoreBadge() {
  const badge = $('#restoreBadge');
  if (!badge) return;
  if (state.result && state.result.found) {
    badge.textContent = fmtDist(state.result.distance);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

function minimizePanel() {
  state.minimized = true;
  const layout = document.documentElement.dataset.layout || 'desktop';
  const panel = $('#panel');
  const restoreBtn = $('#restorePanelBtn');

  if (layout === 'mobile') {
    state.lastMobileState = panel.classList.contains('sheet-expanded') ? 'expanded' : 'half';
    setSheetState('collapsed');
    if (restoreBtn) restoreBtn.hidden = true;
    updateMinBtnIcon(true);
  } else {
    panel.classList.add('is-minimized');
    if (restoreBtn) {
      restoreBtn.hidden = false;
      updateRestoreBadge();
    }
  }
}

function restorePanel() {
  state.minimized = false;
  const layout = document.documentElement.dataset.layout || 'desktop';
  const panel = $('#panel');
  const restoreBtn = $('#restorePanelBtn');

  panel.classList.remove('is-minimized');
  if (restoreBtn) restoreBtn.hidden = true;
  updateMinBtnIcon(false);

  if (layout === 'mobile') {
    const targetState = state.lastMobileState || (state.result ? 'expanded' : 'half');
    setSheetState(targetState);
  }
}

function toggleMinimizePanel() {
  const layout = document.documentElement.dataset.layout || 'desktop';
  if (layout === 'mobile') {
    const cur = getSheetState();
    if (cur === 'collapsed') restorePanel();
    else minimizePanel();
  } else {
    if (state.minimized) restorePanel();
    else minimizePanel();
  }
}

function initViewMode() {
  const getSavedMode = () => {
    try {
      return localStorage.getItem('cu_nav_view_mode') || 'auto';
    } catch {
      return 'auto';
    }
  };

  const computeLayout = (mode) => {
    if (mode === 'laptop') return 'desktop';
    if (mode === 'mobile') return 'mobile';
    const w = window.innerWidth;
    if (w < 768) return 'mobile';
    if (w <= 1024) return 'tablet';
    return 'desktop';
  };

  const applyLayout = (mode, save = true) => {
    if (save) {
      try { localStorage.setItem('cu_nav_view_mode', mode); } catch {}
    }
    const layout = computeLayout(mode);
    document.documentElement.dataset.viewMode = mode;
    document.documentElement.dataset.layout = layout;

    $$('.view-mode-btn').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      if (b.dataset.mode === 'auto') {
        const layoutName = layout === 'desktop' ? 'Laptop' : layout.charAt(0).toUpperCase() + layout.slice(1);
        b.title = `Automatic (${layoutName} view active)`;
      }
    });

    const panel = $('#panel');
    const restoreBtn = $('#restorePanelBtn');
    if (state.minimized) {
      if (layout === 'mobile') {
        panel.classList.remove('is-minimized');
        setSheetState('collapsed');
        if (restoreBtn) restoreBtn.hidden = true;
        updateMinBtnIcon(true);
      } else {
        panel.classList.add('is-minimized');
        if (restoreBtn) {
          restoreBtn.hidden = false;
          updateRestoreBadge();
        }
      }
    } else {
      if (layout === 'mobile') {
        if (!panel.classList.contains('sheet-collapsed') && !panel.classList.contains('sheet-expanded') && !panel.classList.contains('sheet-half')) {
          setSheetState('half');
        }
      } else {
        panel.classList.remove('is-minimized');
        if (restoreBtn) restoreBtn.hidden = true;
      }
      updateMinBtnIcon(false);
    }

    if (stage && typeof stage.resize === 'function') {
      stage.resize();
    }
  };

  $$('.view-mode-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideSuggest();
      const mode = btn.dataset.mode;
      applyLayout(mode, true);
    });
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const curMode = getSavedMode();
      if (curMode === 'auto') {
        applyLayout('auto', false);
      } else if (stage && typeof stage.resize === 'function') {
        stage.resize();
      }
    }, 60);
  });

  applyLayout(getSavedMode(), false);
}

function initBottomSheet() {
  const handle = $('#sheetHandle');
  const panel = $('#panel');
  if (!handle || !panel) return;

  handle.addEventListener('click', () => {
    if (document.documentElement.dataset.layout !== 'mobile') return;
    const cur = getSheetState();
    if (cur === 'collapsed') {
      restorePanel();
    } else if (cur === 'half') {
      const hasResult = state.result && !$('#result').hidden;
      if (hasResult) {
        state.minimized = false;
        updateMinBtnIcon(false);
        setSheetState('expanded');
      } else {
        minimizePanel();
      }
    } else {
      state.minimized = false;
      updateMinBtnIcon(false);
      setSheetState('half');
    }
  });

  let startY = 0, isDragging = false, startState = 'half';
  const onTouchStart = (e) => {
    if (document.documentElement.dataset.layout !== 'mobile') return;
    const touch = e.touches ? e.touches[0] : e;
    startY = touch.clientY;
    isDragging = true;
    startState = getSheetState();
  };

  const onTouchEnd = (e) => {
    if (!isDragging) return;
    isDragging = false;
    const touch = e.changedTouches ? e.changedTouches[0] : e;
    const dy = touch.clientY - startY;
    if (Math.abs(dy) > 30) {
      if (dy > 0) {
        if (startState === 'expanded') {
          state.minimized = false;
          updateMinBtnIcon(false);
          setSheetState('half');
        } else if (startState === 'half') {
          minimizePanel();
        }
      } else {
        if (startState === 'collapsed') {
          restorePanel();
        } else if (startState === 'half') {
          state.minimized = false;
          updateMinBtnIcon(false);
          setSheetState('expanded');
        }
      }
    }
  };

  handle.addEventListener('touchstart', onTouchStart, { passive: true });
  handle.addEventListener('touchend', onTouchEnd, { passive: true });
  handle.addEventListener('pointerdown', onTouchStart);
  handle.addEventListener('pointerup', onTouchEnd);

  for (const which of ['from', 'to']) {
    $(`#${which}Input`)?.addEventListener('focus', () => {
      if (document.documentElement.dataset.layout === 'mobile' && getSheetState() === 'collapsed') {
        restorePanel();
      }
    });
  }
}

/* ------------------------------------------------------------------ wiring */
function wireUI() {
  for (const which of ['from', 'to']) {
    const input = $(`#${which}Input`);
    input.addEventListener('focus', () => { input.select(); renderSuggest(which, ''); });
    input.addEventListener('input', () => renderSuggest(which, input.value));
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) hideSuggest(); }, 120));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if ($('#suggest').hidden) renderSuggest(which, input.value); highlight(sugIdx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(sugIdx - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = sugItems[Math.max(0, sugIdx)]; if (it) { choose(it); input.blur(); } }
      else if (e.key === 'Escape') { hideSuggest(); input.blur(); }
    });
  }
  $$('[data-clear]').forEach((b) => b.addEventListener('click', () => { setEndpoint(b.dataset.clear, null, { route: false }); clearRoute(false); }));
  $$('[data-pick]').forEach((b) => b.addEventListener('click', () => startPick(b.dataset.pick)));
  $('#swapBtn').addEventListener('click', () => { const f = state.from, t = state.to; setEndpoint('from', t, { route: false }); setEndpoint('to', f, { route: false }); requestRoute(); });
  $$('.seg button').forEach((b) => b.addEventListener('click', () => setProfile(b.dataset.profile)));
  $('#clearBtn').addEventListener('click', () => { clearRoute(true); stage.resetView(); });
  $('#visualizeBtn')?.addEventListener('click', openVisualizer);
  $('#visMapBtn')?.addEventListener('click', () => {
    if (visualizer && visualizer.group.visible) {
      visualizer.hide();
      $('#visMapBtn')?.classList.remove('on');
      $('#mobileVisBtn')?.classList.remove('on');
    } else {
      openVisualizer();
    }
  });
  $('#flyBtn').addEventListener('click', () => {
    if (routeView.flying) return routeView.stopFlythrough();
    $('#flyBtn').lastChild.textContent = 'Stop preview'; routeView.startFlythrough(() => { $('#flyBtn').lastChild.textContent = 'Preview walk'; });
  });
  $('#shareBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); toast('Link copied'); } catch { toast('Copy the address bar to share this route'); } });
  $('#dataBanner').addEventListener('click', openDataDialog);
  $('#dataDialog').addEventListener('click', (e) => { if (e.target === $('#dataDialog')) $('#dataDialog').close(); });
  $('#themeBtn').addEventListener('click', () => { const d = document.documentElement.dataset.theme !== 'dusk'; document.documentElement.dataset.theme = d ? 'dusk' : 'day'; stage.setDusk(d); world.setDusk(d); });
  $('#compass').addEventListener('click', () => stage.resetView());
  $('#view3d').addEventListener('click', () => { stage.flyTo({ polar: 0.92 }, 0.8); $('#view3d').classList.add('on'); $('#viewTop').classList.remove('on'); });
  $('#viewTop').addEventListener('click', () => { stage.topView(); $('#viewTop').classList.add('on'); $('#view3d').classList.remove('on'); });

  // Zoom In / Out
  $('#zoomInBtn')?.addEventListener('click', () => stage.zoomIn());
  $('#zoomOutBtn')?.addEventListener('click', () => stage.zoomOut());

  // Drag Mode: Rotate vs Pan
  const updateDragBtns = (mode) => {
    $('#dragRotateBtn')?.classList.toggle('on', mode === 'rotate');
    $('#dragPanBtn')?.classList.toggle('on', mode === 'pan');
  };
  $('#dragRotateBtn')?.addEventListener('click', () => { stage.setDragMode('rotate'); updateDragBtns('rotate'); });
  $('#dragPanBtn')?.addEventListener('click', () => { stage.setDragMode('pan'); updateDragBtns('pan'); });

  // Navigation Guide Card
  $('#navHelpBtn')?.addEventListener('click', () => {
    const card = $('#navHelpCard');
    if (card) card.hidden = !card.hidden;
  });
  $('#navHelpClose')?.addEventListener('click', () => {
    const card = $('#navHelpCard');
    if (card) card.hidden = true;
  });

  $$('[data-layer]').forEach((b) => b.addEventListener('click', () => {
    b.classList.toggle('on'); const on = b.classList.contains('on'), k = b.dataset.layer;
    if (k === 'labels') labels.setVisible(on); else if (k === 'trees') world.layers.trees.visible = on; else if (k === 'graph') world.layers.graph.visible = on;
  }));
  initViewMode();
  initBottomSheet();
  $('#minPanelBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideSuggest();
    toggleMinimizePanel();
  });
  $('#restorePanelBtn')?.addEventListener('click', () => {
    restorePanel();
  });
  // quick-pick chips
  const chips = [['gate-1', 'Main Gate'], ['d6-library', 'D6 Central Library'], ['b3-engineering', 'B3 – DSW'], ['b4-engineering', 'B4 – Kalpana Chawla'], ['food-republic', 'Food Republic'], ['sports-complex', 'Sports Complex'], ['fountain-plaza', 'Fountain']];
  $('#chips').innerHTML = chips.map(([id, n]) => `<button data-chip="${id}">${esc(n)}</button>`).join('');
  $$('[data-chip]').forEach((b) => b.addEventListener('click', () => { const e = { type: 'place', id: b.dataset.chip }; if (!state.from) setEndpoint('from', e); else if (!state.to) setEndpoint('to', e); else setEndpoint('to', e); }));
  // pointer: click vs drag
  let down = null; const cv = stage.canvas;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; $('#mapMenu').hidden = true; });
  cv.addEventListener('pointerup', (e) => {
    if (stage.spaceDown || stage.dragMode === 'pan') { down = null; return; }
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && performance.now() - down.t < 500 && e.button === 0) onStageClick(e);
    down = null;
  });
  addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $(state.from ? '#toInput' : '#fromInput').focus(); }
    if (e.key === 'Escape') {
      endPick();
      $('#mapMenu').hidden = true;
      if ($('#navHelpCard')) $('#navHelpCard').hidden = true;
      routeView.stopFlythrough();
      const el = $('#info');
      if (el && !el.hidden) { el.hidden = true; state.selected = null; labels.setState({ selected: null }); }
    }
  });
  wireMobileUI();
  addEventListener('hashchange', () => { /* manual edits of the URL */ });
}

async function openVisualizer() {
  routeView.stopFlythrough();
  if (document.documentElement.dataset.layout === 'mobile') {
    setSheetState('collapsed');
  }
  if (!state.from && !state.to) {
    toast('Visualizing Dijkstra from Gate 1 to D6 Library');
    setEndpoint('from', { type: 'place', id: 'gate-1' }, { route: false });
    setEndpoint('to', { type: 'place', id: 'd6-library' }, { route: false });
  } else if (!state.from) {
    toast('Select a start location to visualize Dijkstra');
    $('#fromInput')?.focus();
    return;
  } else if (!state.to) {
    toast('Select a destination to visualize Dijkstra');
    $('#toInput')?.focus();
    return;
  }
  if (state.result && state.result.trace && state.result.trace.length) {
    visualizer.show(state.result, campus);
    $('#visMapBtn')?.classList.add('on');
    $('#mobileVisBtn')?.classList.add('on');
  } else {
    showStatus('Fetching C++ Dijkstra algorithm trace…');
    try {
      const r = await fetchRoute(state.from, state.to, state.profile, true);
      showStatus('');
      if (!r.found) { showStatus(r.message || 'No route found.', true); return; }
      state.result = r;
      visualizer.show(r, campus);
      $('#visMapBtn')?.classList.add('on');
      $('#mobileVisBtn')?.classList.add('on');
    } catch (e) {
      showStatus(`Failed to load visualizer trace: ${e.message}`, true);
    }
  }
}

function wireMobileUI() {
  $('#mobilePreviewWalkBtn')?.addEventListener('click', async () => {
    if (state.result) {
      setMobileView('preview');
      routeView.fit();
      return;
    }
    if (state.from && state.to) {
      await requestRoute();
      if (state.result) {
        setMobileView('preview');
        routeView.fit();
      }
      return;
    }
    if (!state.from) {
      toast('Select a start location');
      $('#fromInput')?.focus();
    } else if (!state.to) {
      toast('Select a destination');
      $('#toInput')?.focus();
    }
  });

  $('#mobileBackBtn')?.addEventListener('click', () => {
    setMobileView('plan');
  });

  $('#startWalkingBtn')?.addEventListener('click', () => {
    if (routeView.flying) {
      routeView.stopFlythrough();
      const txt = $('#startWalkingBtn span'); if (txt) txt.textContent = 'Start walking';
    } else {
      const txt = $('#startWalkingBtn span'); if (txt) txt.textContent = 'Stop walking';
      routeView.startFlythrough(() => {
        const t1 = $('#startWalkingBtn span'); if (t1) t1.textContent = 'Start walking';
        const t2 = $('#mobileRouteFlyBtn span'); if (t2) t2.textContent = 'Preview route';
      });
    }
  });

  $('#mobileRouteFlyBtn')?.addEventListener('click', () => {
    if (routeView.flying) {
      routeView.stopFlythrough();
      const txt = $('#mobileRouteFlyBtn span'); if (txt) txt.textContent = 'Preview route';
      const t1 = $('#startWalkingBtn span'); if (t1) t1.textContent = 'Start walking';
    } else {
      const txt = $('#mobileRouteFlyBtn span'); if (txt) txt.textContent = 'Stop preview';
      routeView.startFlythrough(() => {
        const t1 = $('#mobileRouteFlyBtn span'); if (t1) t1.textContent = 'Preview route';
        const t2 = $('#startWalkingBtn span'); if (t2) t2.textContent = 'Start walking';
      });
    }
  });

  $('#mobileRouteShareBtn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Link copied to clipboard');
    } catch {
      toast('Copy the address bar to share this route');
    }
  });

  $('#mobileVisBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (visualizer && visualizer.group.visible) {
      visualizer.hide();
      $('#visMapBtn')?.classList.remove('on');
      $('#mobileVisBtn')?.classList.remove('on');
      if (document.documentElement.dataset.layout === 'mobile') setSheetState('half');
    } else {
      openVisualizer();
    }
  });

  $('#mobileBookmarkBtn')?.addEventListener('click', () => {
    toast('Route saved to bookmarks');
  });

  // Mobile Map Settings Popover
  const settingsBtn = $('#mobileSettingsBtn');
  const popover = $('#mobileSettingsPopover');
  const closePopover = () => { if (popover) popover.hidden = true; };

  settingsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popover) popover.hidden = !popover.hidden;
  });

  $('#mobileSettingsClose')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closePopover();
  });

  document.addEventListener('click', (e) => {
    if (popover && !popover.hidden && !popover.contains(e.target) && e.target !== settingsBtn) {
      closePopover();
    }
  });

  const bindLayerToggle = (btnId, layerName) => {
    const btn = $(`#${btnId}`);
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willBeOn = !btn.classList.contains('on');
      btn.classList.toggle('on', willBeOn);
      btn.textContent = willBeOn ? 'On' : 'Off';
      btn.setAttribute('aria-checked', String(willBeOn));
      const desktopBtn = $(`[data-layer="${layerName}"]`);
      if (desktopBtn) desktopBtn.classList.toggle('on', willBeOn);
      if (layerName === 'labels') labels.setVisible(willBeOn);
      else if (layerName === 'trees') world.layers.trees.visible = willBeOn;
      else if (layerName === 'graph') world.layers.graph.visible = willBeOn;
    });
  };
  bindLayerToggle('mobLayerLabels', 'labels');
  bindLayerToggle('mobLayerTrees', 'trees');
  bindLayerToggle('mobLayerGraph', 'graph');

  $('#mobToggleVis')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closePopover();
    openVisualizer();
  });

  $('#mobView3d')?.addEventListener('click', (e) => {
    e.stopPropagation();
    stage.flyTo({ polar: 0.92 }, 0.8);
    $('#mobView3d')?.classList.add('on');
    $('#mobViewTop')?.classList.remove('on');
    $('#view3d')?.classList.add('on');
    $('#viewTop')?.classList.remove('on');
  });

  $('#mobViewTop')?.addEventListener('click', (e) => {
    e.stopPropagation();
    stage.topView();
    $('#mobViewTop')?.classList.add('on');
    $('#mobView3d')?.classList.remove('on');
    $('#viewTop')?.classList.add('on');
    $('#view3d')?.classList.remove('on');
  });

  $('#mobResetNorth')?.addEventListener('click', (e) => {
    e.stopPropagation();
    stage.resetView();
  });
}
boot();
