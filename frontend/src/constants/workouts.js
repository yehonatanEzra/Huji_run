// Shared workout helpers for the multi-workout-per-day model.
// Backend returns per-day lists (group_workouts[], individual_targets[]) and,
// transitionally, singular compat fields (group_workout, individual_target).
// These helpers read either shape so callers can migrate incrementally.

// Canonical run workout types (sport tags come later).
export const WORKOUT_TYPES = [
  { value: 'simple',    label: 'Other',     abbr: 'Oth',  structured: false },
  { value: 'easy',      label: 'Easy run',  abbr: 'Easy', structured: false },
  { value: 'rest',      label: 'Rest day',  abbr: 'Rest', structured: false },
  { value: 'tempo',     label: 'Tempo',     abbr: 'Tmp',  structured: true },
  { value: 'long',      label: 'Long run',  abbr: 'Long', structured: true },
  { value: 'intervals', label: 'Intervals', abbr: 'Int',  structured: true },
  { value: 'fartlek',   label: 'Fartlek',   abbr: 'Fart', structured: true },
  { value: 'race',      label: 'Race',      abbr: 'Race', structured: true, mainLabel: 'Race' },
];
export const isStructured = (type) =>
  ['tempo', 'long', 'intervals', 'fartlek', 'race'].includes(type);

// Group sessions, then personal sessions, each in list order. Accepts both the
// new list shape and the old singular compat shape. Returns items tagged with
// `_source` ('group' | 'personal') and a stable `_key`.
export function dayWorkouts(day) {
  if (!day) return [];
  // Athlete shape: group_workouts/individual_targets. Coach shape: group_workout
  // (single) + targets (list). Plus singular compat fields. Handle all.
  const groups = day.group_workouts || (day.group_workout ? [day.group_workout] : []);
  const personals = day.individual_targets || day.targets
    || (day.individual_target ? [day.individual_target] : []);
  return [
    ...groups.map((w, i) => ({ ...w, _source: 'group', _key: `g${w.id ?? i}` })),
    ...personals.map((w, i) => ({ ...w, _source: 'personal', _key: `p${w.id ?? i}` })),
  ];
}

// Sum of planned distance across a day's (visible) workouts.
export function dayPlannedKm(day) {
  return dayWorkouts(day).reduce((s, w) => s + (w.distance_km || 0), 0);
}

// What the athlete actually sees on a day, given the visibility model. Use this
// on COACH data (which carries every workout + the flags) to mirror the athlete's
// view; athlete responses are already filtered server-side. Rules:
//   - `day.hide_group` ("don't show group workout today") drops the group sessions
//   - hidden personal targets are coach-only drafts → excluded
//   - when a group workout is still visible, only `additional` personals also show;
//     a non-additional personal is suppressed by the group workout
//   - with no visible group workout, all (non-hidden) personals show
export function visibleDayWorkouts(day) {
  const all = dayWorkouts(day);
  const groups = day?.hide_group ? [] : all.filter((w) => w._source === 'group');
  const personals = all.filter((w) => w._source === 'personal' && !w.hidden);
  const shownPersonals = groups.length > 0 ? personals.filter((w) => w.additional) : personals;
  return [...groups, ...shownPersonals];
}

// Sum of planned distance across the workouts the athlete actually sees.
export function visibleDayPlannedKm(day) {
  return visibleDayWorkouts(day).reduce((s, w) => s + (w.distance_km || 0), 0);
}
