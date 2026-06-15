import client from './client';

export const listGoals = (athleteId) => client.get(`/goals/${athleteId}`);
export const createGoal = (body) => client.post('/goals', body);
export const deleteGoal = (id) => client.delete(`/goals/${id}`);
