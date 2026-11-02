export async function getCampus() {
  const r = await fetch('/api/campus'); if (!r.ok) throw new Error(`campus data: HTTP ${r.status}`); return r.json();
}
export async function health() { try { const r = await fetch('/api/health'); return { status: r.status, ...(await r.json()) }; } catch (e) { return { ok: false, error: String(e) }; } }
const ep = (e) => (e.type === 'place' ? e.id : `${e.x.toFixed(2)},${e.z.toFixed(2)}`);
export async function route(from, to, profile = 'walk', visualize = false) {
  const u = `/api/route?from=${encodeURIComponent(ep(from))}&to=${encodeURIComponent(ep(to))}&profile=${profile}${visualize ? '&visualize=true' : ''}`;
  const r = await fetch(u); const j = await r.json().catch(() => ({ ok: false, error: { message: `HTTP ${r.status}` } }));
  if (!j.ok) throw new Error(j.error?.message || 'routing failed'); return j;
}
