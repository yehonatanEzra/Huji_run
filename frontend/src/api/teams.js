import client from './client';

export const createTeam = (data) => client.post('/teams/', data);

export const switchTeam = (team_id) => client.post('/auth/switch-team', { team_id });

export const getMyTeams = () => client.get('/teams/my');

export const updateTeam = (teamId, data) => client.patch(`/teams/${teamId}`, data);

export const getPublicTeam = (teamId) => client.get(`/public/teams/${teamId}`);
