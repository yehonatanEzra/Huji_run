import api from './client';

export const getStravaConnectUrl = () =>
  api.get('/strava/connect-url', { params: { origin: window.location.origin } });
export const disconnectStrava = () => api.delete('/strava/disconnect');
export const getAthleteStravaActivities = (athleteId, date) =>
  api.get(`/strava/activities/${athleteId}`, { params: { date } });
export const getMyStravaActivities = (date) =>
  api.get('/strava/my-activities', { params: { date } });
export const syncStrava = (days = 14) =>
  api.post('/strava/sync', null, { params: { days } });
export const getMyActivityDetail = (activityId) =>
  api.get(`/strava/my-activity/${activityId}`);
export const getAthleteActivityDetail = (athleteId, activityId) =>
  api.get(`/strava/activity/${athleteId}/${activityId}`);

// Admin
export const adminListStravaUsers = () =>
  api.get('/strava/admin/users');
export const adminDisconnectStrava = (userId) =>
  api.post(`/strava/admin/disconnect/${userId}`);
export const adminDisconnectAllStrava = () =>
  api.post('/strava/admin/disconnect-all');
export const adminGetStravaStatus = () =>
  api.get('/strava/admin/status');
export const adminBlockAllStrava = () =>
  api.post('/strava/admin/block-all');
export const adminReleaseStrava = () =>
  api.post('/strava/admin/release');
export const adminEnableAllStrava = () =>
  api.post('/strava/admin/enable-all');
export const adminSetStravaEnabled = (userId, enabled) =>
  api.post(`/strava/admin/set-enabled/${userId}`, { enabled });
