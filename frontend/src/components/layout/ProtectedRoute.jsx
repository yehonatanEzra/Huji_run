import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function ProtectedRoute({ children, requireCoach, requireAdmin }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  // Admin is a superset of coach permissions for `requireCoach` checks.
  if (requireCoach && user.role !== 'coach' && user.role !== 'admin') {
    return <Navigate to="/calendar" replace />;
  }
  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/calendar" replace />;
  }
  return children;
}
