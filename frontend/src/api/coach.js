import client from './client';

export const listAthletes = () =>
  client.get('/coach/athletes');

export const searchAthletes = (q) =>
  client.get('/coach/athletes/search', { params: { q } });

export const getDashboardWeek = (date) =>
  client.get('/coach/dashboard/week', { params: { day: date } });
