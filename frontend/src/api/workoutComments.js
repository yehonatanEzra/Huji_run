import client from './client';

export const listWorkoutComments = (logId) =>
  client.get(`/workout-logs/${logId}/comments`);

export const createWorkoutComment = (logId, body) =>
  client.post(`/workout-logs/${logId}/comments`, { body });

export const deleteWorkoutComment = (logId, commentId) =>
  client.delete(`/workout-logs/${logId}/comments/${commentId}`);
