import client from './client';

export const toggleKudos = (workoutLogId) =>
  client.post(`/kudos/${workoutLogId}`);
