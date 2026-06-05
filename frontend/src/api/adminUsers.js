import client from './client';

export const listAllUsers = () => client.get('/admin/users');

export const patchUser = (userId, body) =>
  client.patch(`/admin/users/${userId}`, body);

export const deleteUser = (userId) =>
  client.delete(`/admin/users/${userId}`);
