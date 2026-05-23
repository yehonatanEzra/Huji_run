import client from './client';

export const getHallOfFame = (groupId) =>
  client.get('/hall-of-fame', { params: groupId ? { group_id: groupId } : {} });

export const getHofGroups = () =>
  client.get('/hall-of-fame/groups');
