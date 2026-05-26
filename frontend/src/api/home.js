import client from './client';

export const getHomeSummary = () => client.get('/home/summary');
