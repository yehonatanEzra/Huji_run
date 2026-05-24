import client from './client';

export const getWeek = (date, groupId) =>
  client.get('/calendar/week', { params: { day: date, ...(groupId ? { group_id: groupId } : {}) } });

export const submitLog = (data) =>
  client.post('/calendar/log', data);

export const upsertGroupWorkout = (groupId, date, body = {}) =>
  client.put(`/calendar/group/${groupId}/${date}`, body);

export const deleteGroupWorkout = (groupId, date) =>
  client.delete(`/calendar/group/${groupId}/${date}`);

export const upsertTarget = (athleteId, date, note, overrideGroup = false) =>
  client.put(`/calendar/targets/${athleteId}/${date}`, { note, override_group: overrideGroup });

export const deleteTarget = (athleteId, date) =>
  client.delete(`/calendar/targets/${athleteId}/${date}`);
