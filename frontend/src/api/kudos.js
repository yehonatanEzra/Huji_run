import client from './client';

export const toggleKudos = (workoutLogId, emoji = 'clap') =>
  client.post(`/kudos/${workoutLogId}`, { emoji });
