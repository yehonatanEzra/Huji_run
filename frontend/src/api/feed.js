import client from './client';

export const getFeed = (beforeId) => {
  const params = {};
  if (beforeId) params.before_id = beforeId;
  return client.get('/feed', { params });
};

export const createAnnouncement = (data) =>
  client.post('/feed', data);

export const deleteAnnouncement = (id) =>
  client.delete(`/feed/${id}`);

export const toggleReaction = (announcementId, emoji) =>
  client.post(`/feed/${announcementId}/react`, { emoji });
