import { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  // On boot, refresh the user object from /auth/me so any fields added since the
  // last login (like training_group_id) appear without forcing a logout.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    client.get('/auth/me').then(({ data }) => {
      const merged = {
        id: data.id,
        role: data.role,
        full_name: data.full_name,
        username: data.username,
        gender: data.gender,
        training_group_id: data.training_group_id,
        coach_id: data.coach_id ?? null,
        strava_connected: data.strava_connected ?? false,
      };
      localStorage.setItem('user', JSON.stringify(merged));
      setUser(merged);
    }).catch(() => {});
  }, []);

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

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
