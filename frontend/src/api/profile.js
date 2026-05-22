import client from './client';

export const getMyProfile = () =>
  client.get('/profile/me');
