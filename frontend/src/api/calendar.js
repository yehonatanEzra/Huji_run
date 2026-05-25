import client from './client';

export const getWeek = (date, groupId) =>
  client.get('/calendar/week', { params: { day: date, ...(groupId ? { group_id: groupId } : {}) } });

export const submitLog = (data) =>
  client.post('/calendar/log', data);

export const upsertGroupWorkout = (groupId, date, body = {}) =>
  client.put(`/calendar/group/${groupId}/${date}`, body);

export const deleteGroupWorkout = (groupId, date) =>
  client.delete(`/calendar/group/${groupId}/${date}`);

export const upsertTarget = (athleteId, date, body) => {
  // Backward-compat: callers can pass (note, override) as positional args
  if (typeof body === 'string') {
    body = { note: body, override_group: arguments[3] || false };
  }
  return client.put(`/calendar/targets/${athleteId}/${date}`, body);
};

export const deleteTarget = (athleteId, date) =>
  client.delete(`/calendar/targets/${athleteId}/${date}`);
