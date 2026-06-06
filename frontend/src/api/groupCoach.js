import client from './client';

export const listGroupCoaches = (groupId) =>
  client.get(`/groups/${groupId}/coaches`);

export const searchCoaches = (q) =>
  client.get('/groups/coaches/search', { params: { q } });

export const addGroupCoach = (groupId, userId, role = 'assistant') =>
  client.post(`/groups/${groupId}/coaches`, { user_id: userId, role });

export const removeGroupCoach = (groupId, userId) =>
  client.delete(`/groups/${groupId}/coaches/${userId}`);

export const transferGroupOwnership = (groupId, newMainUserId) =>
  client.patch(`/groups/${groupId}/transfer`, { new_main_user_id: newMainUserId });
