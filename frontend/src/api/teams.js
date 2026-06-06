import client from './client';

export const createTeam = (data) => client.post('/teams/', data);

export const switchTeam = (team_id) => client.post('/auth/switch-team', { team_id });

export const getMyTeams = () => client.get('/teams/my');
