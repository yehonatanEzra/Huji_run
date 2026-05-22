import client from './client';

export const getHallOfFame = () =>
  client.get('/hall-of-fame');
