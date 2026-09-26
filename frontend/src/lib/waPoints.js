// World Athletics points — public API over the embedded 2025 scoring tables.
import { COEFFS, EVENTS, EVENT_BY_ID, pointsFor as rawPointsFor } from './waScoringTables.js';

export { COEFFS, EVENTS, EVENT_BY_ID };

/**
 * World Athletics points for a result. The raw quadratic (a·x²+b·x+c) is an
 * upward parabola, so for TIME events it only scores on the decreasing branch
 * (faster than the vertex). Beyond the vertex a slower time would wrongly score
 * higher, so we return null there — the result is slower than the tables score.
 * @returns {number|null}
 */
export function pointsFor(eventId, gender, x) {
  const ev = EVENT_BY_ID[eventId];
  const table = COEFFS[gender];
  if (!ev || !table || !table[eventId] || !(x > 0)) return null;
  if (ev.type === 'time') {
    const [a, b] = table[eventId];
    if (x >= -b / (2 * a)) return null; // at/after the vertex: too slow to score
  }
  return rawPointsFor(eventId, gender, x);
}

/**
 * Inverse of pointsFor: the result that scores `points` in an event. Solves
 * a·x² + b·x + (c − points) = 0 and picks the athletically-real branch — the
 * faster (smaller) root for time events, the larger root for distance/combined.
 * @returns {number|null} seconds | metres | points total, or null if unattainable.
 */
export function resultForPoints(eventId, gender, points) {
  const table = COEFFS[gender];
  const ev = EVENT_BY_ID[eventId];
  if (!table || !table[eventId] || !ev || !(points > 0)) return null;
  const [a, b, c] = table[eventId];
  const disc = b * b - 4 * a * (c - points);
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const lo = (-b - sq) / (2 * a);
  const hi = (-b + sq) / (2 * a);
  const x = ev.type === 'time' ? (lo > 0 ? lo : hi) : Math.max(lo, hi);
  return x > 0 ? x : null;
}

export const CATEGORY_LABELS = {
  track: 'Track',
  road: 'Road',
  walk: 'Race walk',
  field: 'Field',
  combined: 'Combined events',
};
export const CATEGORY_ORDER = ['track', 'road', 'field', 'walk', 'combined'];

/** Events available for a gender, grouped by category in display order. */
export function eventsByCategory(gender) {
  const groups = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    events: EVENTS.filter((e) => e.category === cat && e[gender]),
  })).filter((g) => g.events.length > 0);
  return groups;
}

// The app's canonical race distances (m) -> WA event id, so the training log and
// the Zones tab can offer a matching Points lookup.
export const CANONICAL_TO_EVENT = {
  1500: '1500m',
  3000: '3000m',
  5000: '5000m',
  10000: '10000m',
  21100: 'Road HM',
  42200: 'Road Marathon',
};

// ── Dev self-check (run: node frontend/src/lib/waPoints.js) ───────────────────
// Reference marks verified against the World Athletics tables / points calculators.
export function runSelfCheck() {
  const near = (got, want, tol, msg) => {
    if (got == null || Math.abs(got - want) > tol) throw new Error(`FAIL ${msg}: got ${got}, expected ~${want} (±${tol})`);
    console.log(`ok  ${msg}: ${got}`);
  };
  near(pointsFor('100m', 'men', 9.58), 1355, 3, "men 100m 9.58");
  near(pointsFor('100m', 'men', 10.00), 1206, 3, "men 100m 10.00");
  near(pointsFor('100m', 'women', 10.49), 1313, 3, "women 100m 10.49");
  near(pointsFor('5000m', 'men', 755.36), 1302, 3, "men 5000m 12:35.36");
  near(pointsFor('LJ', 'men', 8.95), 1346, 3, "men LJ 8.95");
  // Road marathon: no memorized reference constant, so assert shape instead —
  // a WR-class time scores ~1300, and faster always outscores slower.
  const mFast = pointsFor('Road Marathon', 'men', 7235);   // 2:00:35
  const mSlow = pointsFor('Road Marathon', 'men', 3 * 3600); // 3:00:00
  if (!(mFast > 1250 && mFast < 1350)) throw new Error(`FAIL marathon WR range: ${mFast}`);
  if (!(mFast > mSlow && mSlow > 0)) throw new Error(`FAIL marathon monotonic: ${mFast} vs ${mSlow}`);
  console.log(`ok  marathon 2:00:35=${mFast} > 3:00:00=${mSlow}`);
  // out-of-range / invalid -> null
  if (pointsFor('100m', 'men', 0) !== null) throw new Error('FAIL: zero result should be null');
  if (pointsFor('nope', 'men', 10) !== null) throw new Error('FAIL: unknown event should be null');
  // Regression: times past the parabola vertex must NOT score (100m vertex ~17s).
  if (pointsFor('100m', 'men', 21) !== null) throw new Error(`FAIL: slow 100m 21s should be null, got ${pointsFor('100m', 'men', 21)}`);
  if (pointsFor('100m', 'men', 50) !== null) throw new Error(`FAIL: slow 100m 50s should be null, got ${pointsFor('100m', 'men', 50)}`);
  console.log('ok  slow times past vertex -> null');
  // Inverse round-trips: result -> points -> result.
  const rt = (ev, g) => {
    const p = 1000;
    const x = resultForPoints(ev, g, p);
    const back = pointsFor(ev, g, x);
    if (x == null || Math.abs(back - p) > 1) throw new Error(`FAIL round-trip ${ev}/${g}: ${x} -> ${back}`);
    console.log(`ok  round-trip ${ev} ${g}: 1000pts -> ${x.toFixed(2)} -> ${back}`);
  };
  rt('100m', 'men'); rt('5000m', 'men'); rt('LJ', 'women'); rt('Road Marathon', 'men');
  console.log('waPoints self-check passed');
}

if (typeof globalThis.process !== 'undefined' && globalThis.process.argv?.[1]?.endsWith('waPoints.js')) {
  runSelfCheck();
}
