// Shared time / pace formatting + parsing. First shared copy in the app; older
// components (StravaActivityDetail.jsx, PerformanceGraphs.jsx) keep private copies.

/**
 * Whole seconds -> "M:SS" (under an hour) or "H:MM:SS". Returns '' when the
 * input isn't a usable positive number, so callers can guard the empty case.
 * @param {number|null|undefined} totalSeconds
 * @returns {string}
 */
export function formatClock(totalSeconds) {
  if (totalSeconds == null || !isFinite(totalSeconds) || totalSeconds < 0) return '';
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${sec}`;
  return `${m}:${sec}`;
}

/**
 * Seconds-per-km -> "M:SS" (no unit suffix; callers append "/km"). '' if invalid.
 * @param {number} secPerKm
 * @returns {string}
 */
export function formatPacePerKm(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm) || secPerKm <= 0) return '';
  const m = Math.floor(secPerKm / 60);
  const s = String(Math.round(secPerKm % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * {h, m, s} (strings or numbers) -> total whole seconds. Missing parts count as 0.
 * @param {{h?: number|string, m?: number|string, s?: number|string}} parts
 * @returns {number}
 */
export function parseHMS({ h = 0, m = 0, s = 0 } = {}) {
  const n = (x) => {
    const v = parseInt(x, 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  return n(h) * 3600 + n(m) * 60 + n(s);
}
