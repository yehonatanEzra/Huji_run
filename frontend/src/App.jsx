import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/layout/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CalendarPage from './pages/athlete/CalendarPage';
import HomePage from './pages/athlete/HomePage';
import RaceArchivePage from './pages/athlete/RaceArchivePage';
import RaceDetailPage from './pages/athlete/RaceDetailPage';
import HallOfFamePage from './pages/athlete/HallOfFamePage';
import ProfilePage from './pages/athlete/ProfilePage';
import WorkoutPublisherPage from './pages/coach/WorkoutPublisherPage';
import IndividualTargetsPage from './pages/coach/IndividualTargetsPage';
import TrackingDashboardPage from './pages/coach/TrackingDashboardPage';
import RaceWizardPage from './pages/coach/RaceWizardPage';
import SettingsPage from './pages/coach/SettingsPage';
import HealthWellnessPage from './pages/HealthWellnessPage';
import FeedPage from './pages/FeedPage';
import AboutPage from './pages/AboutPage';

export default function App() {
  const { user } = useAuth();
  const landingFor = (u) => (u?.role === 'coach' || u?.role === 'admin') ? '/coach/dashboard' : '/home';

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={landingFor(user)} replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to={landingFor(user)} replace /> : <RegisterPage />} />

      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/races" element={<RaceArchivePage />} />
        <Route path="/races/:raceId" element={<RaceDetailPage />} />
        <Route path="/hall-of-fame" element={<HallOfFamePage />} />
        <Route path="/health-wellness" element={<HealthWellnessPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        <Route path="/coach/workouts" element={<ProtectedRoute requireCoach><WorkoutPublisherPage /></ProtectedRoute>} />
        <Route path="/coach/targets" element={<ProtectedRoute requireCoach><IndividualTargetsPage /></ProtectedRoute>} />
        <Route path="/coach/dashboard" element={<ProtectedRoute requireCoach><TrackingDashboardPage /></ProtectedRoute>} />
        <Route path="/coach/race-wizard" element={<ProtectedRoute requireCoach><RaceWizardPage /></ProtectedRoute>} />
        <Route path="/coach/settings" element={<ProtectedRoute requireCoach><SettingsPage /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to={user ? landingFor(user) : "/login"} replace />} />
    </Routes>
  );
}
