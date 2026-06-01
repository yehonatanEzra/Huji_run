import client from './client';

export const listRaces = (params) =>
  client.get('/races', { params });

export const listMyRaces = (params) =>
  client.get('/races', { params: { ...params, mine: true } });

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

export const updateRace = (raceId, data) =>
  client.patch(`/races/${raceId}`, data);

export const deleteRace = (raceId) =>
  client.delete(`/races/${raceId}`);

export const deleteHeat = (raceId, heatId) =>
  client.delete(`/races/${raceId}/heats/${heatId}`);

export const renameHeat = (raceId, heatId, label) =>
  client.patch(`/races/${raceId}/heats/${heatId}`, { label });

export const updateResult = (raceId, heatId, resultId, data) =>
  client.patch(`/races/${raceId}/heats/${heatId}/results/${resultId}`, data);

export const deleteResult = (raceId, heatId, resultId) =>
  client.delete(`/races/${raceId}/heats/${heatId}/results/${resultId}`);

export const listRegistrations = (raceId) =>
  client.get(`/races/${raceId}/registrations`);

export const register = (raceId, data) =>
  client.post(`/races/${raceId}/registrations`, data);

export const updateRegistration = (raceId, userId, data) =>
  client.put(`/races/${raceId}/registrations/${userId}`, data);

export const unregister = (raceId, userId) =>
  client.delete(`/races/${raceId}/registrations/${userId}`);
