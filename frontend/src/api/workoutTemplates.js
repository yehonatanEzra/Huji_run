import client from './client';

export const listTemplates = () =>
  client.get('/workout-templates');

export const getTemplate = (id) =>
  client.get(`/workout-templates/${id}`);

export const createTemplate = (data) =>
  client.post('/workout-templates', data);

export const updateTemplate = (id, data) =>
  client.put(`/workout-templates/${id}`, data);

export const deleteTemplate = (id) =>
  client.delete(`/workout-templates/${id}`);

export const applyTemplate = (id, data) =>
  client.post(`/workout-templates/${id}/apply`, data);
