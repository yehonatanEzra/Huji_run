import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/layout/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CalendarPage from './pages/athlete/CalendarPage';
import VolumePage from './pages/athlete/VolumePage';
import ProgressPage from './pages/athlete/ProgressPage';
import HomePage from './pages/athlete/HomePage';
import FindCoachPage from './pages/athlete/FindCoachPage';
import CoachRequestsPage from './pages/coach/CoachRequestsPage';
import AdminPendingPage from './pages/AdminPendingPage';
import UsersPage from './pages/admin/UsersPage';
import RaceArchivePage from './pages/athlete/RaceArchivePage';
import RaceDetailPage from './pages/athlete/RaceDetailPage';
import HallOfFamePage from './pages/athlete/HallOfFamePage';
import ProfilePage from './pages/athlete/ProfilePage';
import WorkoutPublisherPage from './pages/coach/WorkoutPublisherPage';
import IndividualTargetsPage from './pages/coach/IndividualTargetsPage';
import TrackingDashboardPage from './pages/coach/TrackingDashboardPage';
import AthleteProgressPage from './pages/coach/AthleteProgressPage';
import RaceWizardPage from './pages/coach/RaceWizardPage';
import SettingsPage from './pages/coach/SettingsPage';
import TeamSetupPage from './pages/coach/TeamSetupPage';
import GroupCoachPage from './pages/coach/GroupCoachPage';
import ReportingOverviewPage from './pages/coach/ReportingOverviewPage';
import AnalyticsPage from './pages/coach/AnalyticsPage';
import WorkoutTemplatesPage from './pages/coach/WorkoutTemplatesPage';
import HealthWellnessPage from './pages/HealthWellnessPage';
import FeedPage from './pages/FeedPage';
import AboutPage from './pages/AboutPage';

export default function App() {
  const { user } = useAuth();
  const landingFor = (u) => {
    if (u?.role === 'coach' || u?.role === 'admin') return '/coach/dashboard';
    // Athletes without a coach land on the pairing page.
    if (u?.role === 'athlete' && !u?.coach_id) return '/find-coach';
    return '/home';
  };

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={landingFor(user)} replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to={landingFor(user)} replace /> : <RegisterPage />} />

      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/find-coach" element={<FindCoachPage />} />
        <Route path="/coach/requests" element={<ProtectedRoute requireCoach><CoachRequestsPage /></ProtectedRoute>} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/calendar/volume" element={<VolumePage />} />
        <Route path="/progress" element={<ProgressPage />} />
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
        <Route path="/coach/athletes/:athleteId/progress" element={<ProtectedRoute requireCoach><AthleteProgressPage /></ProtectedRoute>} />
        <Route path="/coach/race-wizard" element={<ProtectedRoute requireCoach><RaceWizardPage /></ProtectedRoute>} />
        <Route path="/admin/pending" element={<ProtectedRoute requireAdmin><AdminPendingPage /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute requireAdmin><UsersPage /></ProtectedRoute>} />
        <Route path="/coach/settings" element={<ProtectedRoute requireCoach><SettingsPage /></ProtectedRoute>} />
        <Route path="/team/setup" element={<ProtectedRoute requireCoach><TeamSetupPage /></ProtectedRoute>} />
        <Route path="/coach/group-coaches" element={<ProtectedRoute requireCoach><GroupCoachPage /></ProtectedRoute>} />
        <Route path="/coach/reporting" element={<ProtectedRoute requireCoach><ReportingOverviewPage /></ProtectedRoute>} />
        <Route path="/coach/analytics" element={<ProtectedRoute requireCoach><AnalyticsPage /></ProtectedRoute>} />
        <Route path="/coach/plans" element={<ProtectedRoute requireCoach><WorkoutTemplatesPage /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to={user ? landingFor(user) : "/login"} replace />} />
    </Routes>
  );
}
