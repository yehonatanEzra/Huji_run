import client from './client';

export const getTeamVolume = (params) =>
  client.get('/analytics/volume', { params });

export const getTeamCompletion = (params) =>
  client.get('/analytics/completion', { params });

export const getTypeBreakdown = (params) =>
  client.get('/analytics/type-breakdown', { params });
