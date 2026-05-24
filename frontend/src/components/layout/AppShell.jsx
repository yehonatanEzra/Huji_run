import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import BottomNav from './BottomNav';
import { useAuth } from '../../contexts/AuthContext';

const ROOT_PATHS = new Set([
  '/calendar', '/races', '/hall-of-fame', '/health-wellness',
  '/profile', '/feed', '/coach/dashboard',
]);

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isRoot = ROOT_PATHS.has(location.pathname);

  return (
    <div className="flex flex-col min-h-dvh">
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between">
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
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-80">{user?.full_name}</span>
          <button onClick={logout} className="underline opacity-70 hover:opacity-100">
            Logout
          </button>
        </div>
      </header>
      <main className="flex-1 pb-20 px-4 py-4 max-w-2xl mx-auto w-full">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
