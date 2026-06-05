import client from './client';

export const getKmSeries = (athleteId, period) =>
  client.get(`/stats/${athleteId}/km-series`, { params: { period } });

export const getPaceTrends = (athleteId) =>
  client.get(`/stats/${athleteId}/pace-trends`);

export const getActivity = (athleteId, period) =>
  client.get(`/stats/${athleteId}/activity`, { params: { period } });
