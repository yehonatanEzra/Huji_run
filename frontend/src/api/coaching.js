import client from './client';

// Coach directory (athlete view)
export const listCoaches = () => client.get('/coaches');

// Athlete pairing
export const getMyPairing = () => client.get('/me/pairing');
export const requestCoach = (coachId) => client.post('/coach-requests', { coach_id: coachId });
export const withdrawRequest = (requestId) => client.delete(`/coach-requests/${requestId}`);
export const leaveCoach = () => client.post('/me/leave-coach');

// Coach inbox
export const incomingRequests = () => client.get('/coach-requests/incoming');
export const acceptRequest = (requestId) => client.post(`/coach-requests/${requestId}/accept`);
export const declineRequest = (requestId) => client.post(`/coach-requests/${requestId}/decline`);

// Coach removes athlete from their roster
export const removeAthleteFromRoster = (athleteId) =>
  client.delete(`/coach/athletes/${athleteId}/registration`);

// Athlete transfer (coach → co-coach, dual approval)
export const createTransfer = (athleteId, toCoachId) =>
  client.post(`/coach/athletes/${athleteId}/transfer`, { to_coach_id: toCoachId });
export const incomingTransfers = () => client.get('/transfers/incoming');
export const approveTransfer = (transferId) => client.post(`/transfers/${transferId}/approve`);
export const declineTransfer = (transferId) => client.post(`/transfers/${transferId}/decline`);
export const cancelTransfer = (transferId) => client.delete(`/transfers/${transferId}`);
