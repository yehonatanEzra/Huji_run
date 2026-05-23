import client from './client';

export const getChallenges = (status = 'active') =>
  client.get('/challenges', { params: { status } });

export const getChallenge = (id) =>
  client.get(`/challenges/${id}`);

export const createChallenge = (data) =>
  client.post('/challenges', data);

export const deleteChallenge = (id) =>
  client.delete(`/challenges/${id}`);
