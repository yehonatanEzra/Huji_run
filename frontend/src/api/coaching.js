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
