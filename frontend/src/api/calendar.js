import client from './client';

export const getWeek = (date) =>
  client.get('/calendar/week', { params: { day: date } });

export const submitLog = (data) =>
  client.post('/calendar/log', data);

export const upsertGroupWorkout = (date, content) =>
  client.put(`/calendar/group/${date}`, { content });

export const deleteGroupWorkout = (date) =>
  client.delete(`/calendar/group/${date}`);

export const upsertTarget = (athleteId, date, note) =>
  client.put(`/calendar/targets/${athleteId}/${date}`, { note });

export const deleteTarget = (athleteId, date) =>
  client.delete(`/calendar/targets/${athleteId}/${date}`);
