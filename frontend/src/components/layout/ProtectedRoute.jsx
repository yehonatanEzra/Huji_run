import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function ProtectedRoute({ children, requireCoach }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (requireCoach && user.role !== 'coach') return <Navigate to="/calendar" replace />;
  return children;
}
