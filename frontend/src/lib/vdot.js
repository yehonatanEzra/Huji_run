// VDOT training-zone math (Jack Daniels / Daniels & Gilbert). Pure functions,
// no React, no I/O. Distances in metres, times in seconds.

/** VO2 (ml/kg/min) at velocity v (m/min). Daniels & Gilbert. */
export function vo2FromVelocity(v) {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

/** Fraction of VO2max sustainable for a race lasting tMin minutes. */
export function pctMaxFromDuration(tMin) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
}

/**
 * VDOT for a performance: distance (m) in time (s).
 * @returns {number} VDOT, or NaN for non-positive inputs.
 */
export function vdotFor(distanceM, timeSec) {
  if (!(distanceM > 0) || !(timeSec > 0)) return NaN;
  const tMin = timeSec / 60;
  const v = distanceM / tMin; // m/min
  return vo2FromVelocity(v) / pctMaxFromDuration(tMin);
}

/**
 * Inverse: velocity (m/min) that yields a given VO2 demand. Positive root of
 * 0.000104 v^2 + 0.182258 v - (4.60 + targetVO2) = 0.
 */
export function velocityForVO2(targetVO2) {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.60 + targetVO2);
  const disc = b * b - 4 * a * c;
  return (-b + Math.sqrt(disc)) / (2 * a);
}

/** Seconds to cover one km at velocity v (m/min). */
export function paceSecPerKmFromVelocity(v) {
  return 60000 / v; // (1000 m / v m·min⁻¹) · 60 s
}

/** Seconds to cover distM metres at velocity v (m/min). */
export function splitSecFromVelocity(v, distM) {
  return (distM / v) * 60;
}

// Training zones as a fraction of VDOT (target VO2 = pct · VDOT). Higher pct is
// a harder effort and therefore a faster pace.
export const ZONES = [
  { key: '1', label: 'Recovery', sub: 'Very easy', pct: [0.58], kind: 'ceiling' },
  { key: '2', label: 'Easy', sub: 'Aerobic base', pct: [0.62, 0.70], kind: 'range' },
  { key: '3', label: 'Marathon', sub: 'Steady', pct: [0.80], kind: 'single' },
  { key: '4', label: 'Threshold', sub: 'Lactate threshold', pct: [0.88], kind: 'single', splits: true },
  { key: '5a', label: 'Interval', sub: 'VO2max', pct: [0.975], kind: 'single', splits: true },
  { key: '5b', label: 'Repetition', sub: 'Speed', pct: [1.05], kind: 'single', splits: true },
];

const paceFromPct = (vdot, pct) => paceSecPerKmFromVelocity(velocityForVO2(pct * vdot));

/**
 * Full zone breakdown for a VDOT value. Each zone carries pace(s) in sec/km and,
 * where relevant, 400 m / 1000 m track splits in seconds.
 * @param {number} vdot
 */
export function zonePaces(vdot) {
  if (!(vdot > 0)) return [];
  return ZONES.map((z) => {
    const out = { key: z.key, label: z.label, sub: z.sub, kind: z.kind };
    if (z.kind === 'range') {
      // pct[0] < pct[1] -> pace[0] is the slower (aerobic) end, pace[1] the faster.
      out.paceSlow = paceFromPct(vdot, z.pct[0]);
      out.paceFast = paceFromPct(vdot, z.pct[1]);
    } else {
      out.pace = paceFromPct(vdot, z.pct[0]);
    }
    if (z.splits) {
      const v = velocityForVO2(z.pct[0] * vdot);
      out.split400 = splitSecFromVelocity(v, 400);
      out.split1000 = splitSecFromVelocity(v, 1000);
    }
    return out;
  });
}

/**
 * One-call helper for the UI: performance -> { vdot, zones }.
 */
export function computeZones(distanceM, timeSec) {
  const vdot = vdotFor(distanceM, timeSec);
  if (!(vdot > 0)) return { vdot: NaN, zones: [] };
  return { vdot, zones: zonePaces(vdot) };
}

// ── Dev self-check (the "unit test examples" — no runner needed) ──────────────
// Run with:  node frontend/src/lib/vdot.js
// Reference values from Daniels' Running Formula VDOT tables.
export function runSelfCheck() {
  const approx = (a, b, tol, msg) => {
    if (Math.abs(a - b) > tol) throw new Error(`FAIL ${msg}: got ${a}, expected ~${b} (±${tol})`);
    console.log(`ok  ${msg}: ${typeof a === 'number' ? a.toFixed(2) : a}`);
  };
  // 5000 m in 20:00 -> VDOT ~49.8 ; 10000 m in 40:00 -> VDOT ~51.9
  approx(vdotFor(5000, 20 * 60), 49.8, 0.6, '5K 20:00 -> VDOT');
  approx(vdotFor(10000, 40 * 60), 51.9, 0.6, '10K 40:00 -> VDOT');
  // 3000 m in 12:00 (Daniels VDOT ~ 47.5)
  approx(vdotFor(3000, 12 * 60), 47.5, 1.0, '3K 12:00 -> VDOT');
  // Threshold pace for VDOT 50 is ~4:15/km per Daniels tables (255 s/km ±5)
  const z = zonePaces(50).find((x) => x.key === '4');
  approx(z.pace, 255, 8, 'VDOT 50 threshold pace (s/km)');
  console.log('vdot self-check passed');
}

// Node-only auto-run (skipped by the browser/Vite bundle).
if (typeof globalThis.process !== 'undefined' && globalThis.process.argv?.[1]?.endsWith('vdot.js')) {
  runSelfCheck();
}
