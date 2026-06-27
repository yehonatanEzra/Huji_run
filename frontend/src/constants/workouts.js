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
