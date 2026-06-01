import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import BottomNav from './BottomNav';
import NotificationBell from '../NotificationBell';
import { useAuth } from '../../contexts/AuthContext';

const ROOT_PATHS = new Set([
  '/home', '/find-coach', '/calendar', '/races', '/hall-of-fame', '/health-wellness',
  '/profile', '/feed', '/coach/dashboard', '/coach/requests', '/admin/pending',
]);

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isRoot = ROOT_PATHS.has(location.pathname);

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <header className="shrink-0 z-40 bg-black/40 backdrop-blur-md border-b border-white/10 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isRoot && (
            <button
              onClick={() => navigate(-1)}
              className="text-white opacity-80 hover:opacity-100 text-xl leading-none pr-1"
              aria-label="Go back"
            >
              ←
            </button>
          )}
          <h1 className="text-lg font-bold tracking-tight">Huji Run</h1>
          <button
            onClick={() => navigate('/about')}
            className="ml-1 text-xs font-medium bg-white/15 hover:bg-white/25 rounded-full px-2.5 py-0.5 transition"
          >
            About
          </button>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <NotificationBell />
          <span className="opacity-80 hidden sm:inline">{user?.full_name}</span>
          <button onClick={logout} className="underline opacity-70 hover:opacity-100">
            Logout
          </button>
        </div>
      </header>

      {/* Only this div scrolls — nav and header are always visible */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 pb-6 max-w-2xl mx-auto w-full">
          <Outlet />
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
