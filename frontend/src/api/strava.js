import api from './client';

export const getStravaConnectUrl = () => api.get('/strava/connect-url');
export const disconnectStrava = () => api.delete('/strava/disconnect');
export const getAthleteStravaActivities = (athleteId, date) =>
  api.get(`/strava/activities/${athleteId}`, { params: { date } });
export const getMyStravaActivities = (date) =>
  api.get('/strava/my-activities', { params: { date } });
