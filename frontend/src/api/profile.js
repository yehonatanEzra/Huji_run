import client from './client';

export const getMyProfile = () =>
  client.get('/profile/me');

export const uploadPhoto = (file) => {
  const form = new FormData();
  form.append('file', file);
  return client.post('/profile/photo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
