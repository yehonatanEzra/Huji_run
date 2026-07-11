import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { switchTeam as apiSwitchTeam } from '../api/teams';
import { syncStrava } from '../api/strava';

const STRAVA_AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

const AuthContext = createContext(null);

const mergeUser = (data) => ({
  id: data.id,
  role: data.role,
  full_name: data.full_name,
  username: data.username,
  gender: data.gender,
  training_group_id: data.training_group_id,
  coach_id: data.coach_id ?? null,
  strava_connected: data.strava_connected ?? false,
  has_photo: data.has_photo ?? false,
  active_team_id: data.active_team_id ?? null,
  active_team_name: data.active_team_name ?? null,
  email: data.email ?? null,
  email_verified: data.email_verified ?? false,
  strava_last_synced_at: data.strava_last_synced_at ?? null,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  // Bumped after a successful photo upload so every <img> that sources the
  // photo endpoint gets a fresh URL (defeats stale browser/edge caches).
  const [photoVersion, setPhotoVersion] = useState(() => Date.now());

  const refreshUser = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return Promise.resolve(null);
    return client.get('/auth/me').then(({ data }) => {
      const merged = mergeUser(data);
      localStorage.setItem('user', JSON.stringify(merged));
      setUser(merged);
      // Auto-sync Strava for athletes who have connected, if 30+ min since last sync.
      if (merged.role === 'athlete' && merged.strava_connected) {
        const lastSynced = merged.strava_last_synced_at ? new Date(merged.strava_last_synced_at).getTime() : 0;
        if (Date.now() - lastSynced > STRAVA_AUTO_SYNC_INTERVAL_MS) {
          syncStrava(2).then(() => {
            window.dispatchEvent(new CustomEvent('strava-synced'));
          }).catch(() => {});
        }
      }
      return merged;
    }).catch(() => null);
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = (tokenData) => {
    localStorage.setItem('token', tokenData.access_token);
    const userData = {
      id: tokenData.user_id,
      role: tokenData.role,
      full_name: tokenData.full_name,
      training_group_id: tokenData.training_group_id ?? null,
      coach_id: tokenData.coach_id ?? null,
      active_team_id: tokenData.active_team_id ?? null,
    };
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const switchTeam = useCallback(async (teamId) => {
    const { data } = await apiSwitchTeam(teamId);
    localStorage.setItem('token', data.access_token);
    await refreshUser();
  }, [refreshUser]);

  const bumpPhotoVersion = useCallback(() => {
    setPhotoVersion(Date.now());
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, switchTeam, photoVersion, bumpPhotoVersion }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
