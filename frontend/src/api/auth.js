import client from './client';

export const login = (username, password) =>
  client.post('/auth/login', { username, password });

export const register = (data) =>
  client.post('/auth/register', data);

export const getMe = () => client.get('/auth/me');
