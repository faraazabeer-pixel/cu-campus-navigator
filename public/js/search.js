// Place search shared by the browser UI and the Node API (pure ES module, no DOM).
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const CATEGORY_WORDS = {
  library: ['library', 'books', 'reading', 'study'], food: ['food', 'eat', 'canteen', 'cafe', 'mess', 'lunch', 'restaurant'],
  hostel: ['hostel', 'dorm', 'room', 'stay'], gate: ['gate', 'entrance', 'exit', 'entry'], sports: ['sports', 'ground', 'court', 'gym', 'play', 'stadium'],
  academic: ['block', 'class', 'lab', 'department', 'school'], admin: ['admin', 'office', 'reception'], medical: ['medical', 'doctor', 'hospital', 'health'],
  bank: ['bank', 'atm', 'cash', 'money'], auditorium: ['auditorium', 'hall', 'seminar'], parking: ['parking', 'car', 'park'], landmark: ['landmark', 'fountain', 'theatre'],
};

function lev1(a, b) { // true when edit distance <= 1
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function buildIndex(places) {
  return places.map((p) => ({
    place: p, name: norm(p.name), aliases: (p.aliases || []).map(norm), tokens: norm(`${p.name} ${(p.aliases || []).join(' ')}`).split(' ').filter(Boolean),
    cat: CATEGORY_WORDS[p.kind] || [],
  }));
}

export function scoreEntry(e, q, qTokens) {
  let s = 0;
  if (e.name === q) s = 1000;
  else if (e.aliases.includes(q)) s = 900;
  else if (e.name.startsWith(q)) s = 800;
  else if (e.aliases.some((a) => a.startsWith(q))) s = 700;
  else if (e.name.includes(q)) s = 600;
  else if (e.aliases.some((a) => a.includes(q))) s = 500;
  if (qTokens.length) {
    let hit = 0;
    for (const t of qTokens) {
      if (e.tokens.some((x) => x === t)) hit += 3;
      else if (e.tokens.some((x) => x.startsWith(t))) hit += 2;
      else if (e.cat.some((c) => c === t || (t.length >= 3 && c.startsWith(t)))) hit += 1.5;
      else if (t.length >= 4 && e.tokens.some((x) => lev1(x, t))) hit += 1;
      else return s; // every token must match somehow for the token score to count
    }
    s = Math.max(s, 100 + hit * 10);
  }
  return s;
}

/** Rank places for a query. Returns [{place, score}], best first. Empty query returns []. */
export function searchPlaces(index, query, limit = 8) {
  const q = norm(query || '');
  if (!q) return [];
  const qTokens = q.split(' ').filter(Boolean);
  return index.map((e) => ({ place: e.place, score: scoreEntry(e, q, qTokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name))
    .slice(0, limit);
}
