import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import client from '../api/client';

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
    };
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const bumpPhotoVersion = useCallback(() => {
    setPhotoVersion(Date.now());
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, photoVersion, bumpPhotoVersion }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
