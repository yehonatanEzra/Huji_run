import client from './client';

export const listPending = () => client.get('/admin/pending');

export const approveRace = (raceId) => client.post(`/admin/pending/races/${raceId}/approve`);
export const rejectRace = (raceId, note) => client.post(`/admin/pending/races/${raceId}/reject`, { note });

export const approveResult = (resultId) => client.post(`/admin/pending/results/${resultId}/approve`);
export const rejectResult = (resultId, note) => client.post(`/admin/pending/results/${resultId}/reject`, { note });
