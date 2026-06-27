import client from './client';

export const getWeek = (date, groupId) =>
  client.get('/calendar/week', { params: { day: date, ...(groupId ? { group_id: groupId } : {}) } });

export const submitLog = (data) =>
  client.post('/calendar/log', data);

export const deleteLog = (day) =>
  client.delete(`/calendar/log/${day}`);

// Coach: full list of workouts for the week, grouped by day. Returns
//   { week_start, days: [{date, group_workouts: [GroupWorkoutOut]}] }
export const getCoachGroupWeek = (groupId, date) =>
  client.get(`/calendar/coach/group/${groupId}`, { params: { day: date } });

export const createGroupWorkout = (groupId, date, body = {}) =>
  client.post(`/calendar/group/${groupId}/${date}`, body);

export const updateGroupWorkoutById = (workoutId, body = {}) =>
  client.put(`/calendar/group-workouts/${workoutId}`, body);

export const deleteGroupWorkoutById = (workoutId) =>
  client.delete(`/calendar/group-workouts/${workoutId}`);

export const upsertTarget = (athleteId, date, body) => {
  // Backward-compat: callers can pass (note, override) as positional args
  if (typeof body === 'string') {
    body = { note: body, override_group: arguments[3] || false };
  }
  return client.put(`/calendar/targets/${athleteId}/${date}`, body);
};

export const deleteTarget = (athleteId, date) =>
  client.delete(`/calendar/targets/${athleteId}/${date}`);

// Multi-workout-per-day: id-addressed CRUD for personal targets.
export const createTarget = (athleteId, date, body) =>
  client.post(`/calendar/targets/${athleteId}/${date}`, body);

export const updateTargetById = (targetId, body) =>
  client.put(`/calendar/individual-targets/${targetId}`, body);

export const deleteTargetById = (targetId) =>
  client.delete(`/calendar/individual-targets/${targetId}`);

export const promoteTarget = (targetId) =>
  client.post(`/calendar/individual-targets/${targetId}/promote`);

// Day-level "don't show group workout today" for one athlete.
export const setGroupVisibility = (athleteId, date, hideGroup) =>
  client.put(`/calendar/group-visibility/${athleteId}/${date}`, { hide_group: hideGroup });
