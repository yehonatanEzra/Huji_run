import client from './client';

export const getHallOfFame = (groupId) =>
  client.get('/hall-of-fame', { params: groupId ? { group_id: groupId } : {} });

export const getHofGroups = () =>
  client.get('/hall-of-fame/groups');

export const getKmLeaders = (groupId, gender) => {
  const params = {};
  if (groupId) params.group_id = groupId;
  if (gender) params.gender = gender;
  return client.get('/hall-of-fame/km-leaders', { params });
};
