import client from './client';

export const listRaces = (params) =>
  client.get('/races', { params });

export const getRace = (id) =>
  client.get(`/races/${id}`);

export const getRaceResults = (id, distanceM) =>
  client.get(`/races/${id}/results`, { params: { distance_m: distanceM } });

export const getRaceLeaderboard = (id, distanceM) =>
  client.get(`/races/${id}/leaderboard`, { params: { distance_m: distanceM } });

export const createRace = (data) =>
  client.post('/races', data);

export const addHeat = (raceId, data) =>
  client.post(`/races/${raceId}/heats`, data);

export const addResult = (raceId, heatId, data) =>
  client.post(`/races/${raceId}/heats/${heatId}/results`, data);
