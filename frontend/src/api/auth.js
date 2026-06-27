import client from './client';

export const login = (username, password) =>
  client.post('/auth/login', { username, password });

export const register = (data) =>
  client.post('/auth/register', data);

export const getMe = () => client.get('/auth/me');

export const requestCode = (email, purpose) =>
  client.post('/auth/request-code', { email, purpose });

export const forgotPassword = (email) =>
  client.post('/auth/forgot-password', { email });

export const resetPassword = (email, code, new_password) =>
  client.post('/auth/reset-password', { email, code, new_password });

export const requestAddEmail = (email) =>
  client.post('/auth/request-add-email', { email });

export const addEmail = (email, code) =>
  client.post('/auth/add-email', { email, code });
