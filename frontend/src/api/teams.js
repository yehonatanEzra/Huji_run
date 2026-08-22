import client from './client';

export const createTeam = (data) => client.post('/teams/', data);

export const switchTeam = (team_id) => client.post('/auth/switch-team', { team_id });

export const getMyTeams = () => client.get('/teams/my');

export const updateTeam = (teamId, data) => client.patch(`/teams/${teamId}`, data);

// Per-group profile: the group's own Hall of Fame + recent results.
export const getGroupProfile = (groupId) => client.get(`/groups/${groupId}/profile`);
