import client from './client';

export const getInfoSections = () => client.get('/info/sections');

// Admin only
export const createInfoSection = (body) => client.post('/info/sections', body);
export const updateInfoSection = (id, body) => client.put(`/info/sections/${id}`, body);
export const deleteInfoSection = (id) => client.delete(`/info/sections/${id}`);
export const moveInfoSection = (id, direction) =>
  client.post(`/info/sections/${id}/move`, null, { params: { direction } });
