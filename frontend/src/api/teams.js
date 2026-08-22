import client from './client';

export const createTeam = (data) => client.post('/teams/', data);

export const switchTeam = (team_id) => client.post('/auth/switch-team', { team_id });

export const getMyTeams = () => client.get('/teams/my');

export const updateTeam = (teamId, data) => client.patch(`/teams/${teamId}`, data);

// In-app team profile (Hall of Fame + recent results) for members and coaches.
export const getTeamProfile = (teamId) => client.get(`/teams/${teamId}/profile`);

// Per-group profile: the group's own Hall of Fame + recent results.
export const getGroupProfile = (groupId) => client.get(`/groups/${groupId}/profile`);
