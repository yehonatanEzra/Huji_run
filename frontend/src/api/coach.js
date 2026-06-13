import client from './client';

export const listAthletes = () =>
  client.get('/coach/athletes');

export const searchAthletes = (q) =>
  client.get('/coach/athletes/search', { params: { q } });

export const getDashboardWeek = (date) =>
  client.get('/coach/dashboard/week', { params: { day: date } });

export const listGroups = () =>
  client.get('/coach/groups');

export const createGroup = (name) =>
  client.post('/coach/groups', { name });

export const getGroup = (groupId) =>
  client.get(`/coach/groups/${groupId}`);

export const renameGroup = (groupId, name) =>
  client.patch(`/coach/groups/${groupId}`, { name });

export const deleteGroup = (groupId) =>
  client.delete(`/coach/groups/${groupId}`);

export const addMemberToGroup = (groupId, athleteId) =>
  client.post(`/coach/groups/${groupId}/members`, { athlete_id: athleteId });

export const removeMemberFromGroup = (groupId, athleteId) =>
  client.delete(`/coach/groups/${groupId}/members/${athleteId}`);

// Group-add approvals (assistant-initiated, main-coach-resolved)
export const listPendingAdds = (groupId) =>
  client.get(`/coach/groups/${groupId}/pending`);

export const approveAdd = (groupId, reqId) =>
  client.post(`/coach/groups/${groupId}/pending/${reqId}/approve`);

export const rejectAdd = (groupId, reqId) =>
  client.post(`/coach/groups/${groupId}/pending/${reqId}/reject`);

export const pendingApprovalsCount = () =>
  client.get('/coach/pending-approvals-count');

export const getAthleteProfile = (athleteId) =>
  client.get(`/coach/athletes/${athleteId}/profile`);

export const getAthleteWeek = (athleteId, date) =>
  client.get(`/coach/athletes/${athleteId}/week`, { params: { day: date } });

export const addAthletePB = (athleteId, data) =>
  client.post(`/coach/athletes/${athleteId}/pb`, data);
