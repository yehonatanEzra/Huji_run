import client from './client';

export const getKmSeries = (athleteId, period) =>
  client.get(`/stats/${athleteId}/km-series`, { params: { period } });

export const getWeeklyVolume = (athleteId) =>
  client.get(`/stats/${athleteId}/weekly-volume`);

export const getMonthlyVolume = (athleteId, year) =>
  client.get(`/stats/${athleteId}/monthly-volume`, { params: year ? { year } : {} });

export const getPaceTrends = (athleteId) =>
  client.get(`/stats/${athleteId}/pace-trends`);

export const getActivity = (athleteId, period) =>
  client.get(`/stats/${athleteId}/activity`, { params: { period } });
