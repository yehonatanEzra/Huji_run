import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import BottomNav from './BottomNav';
import NotificationBell from '../NotificationBell';
import StravaSyncIconButton from '../StravaSyncIconButton';
import { useAuth } from '../../contexts/AuthContext';
import { getMyTeams } from '../../api/teams';

const ROOT_PATHS = new Set([
  '/home', '/find-coach', '/calendar', '/races', '/hall-of-fame', '/health-wellness',
  '/profile', '/feed', '/coach/home', '/coach/dashboard', '/coach/requests', '/admin/pending',
]);

function TeamSwitcherModal({ teams, currentTeamId, onSwitch, onClose }) {
  const [switching, setSwitching] = useState(false);

  const handleSwitch = async (teamId) => {
    if (teamId === currentTeamId || switching) return;
    setSwitching(true);
    try {
      await onSwitch(teamId);
      onClose();
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-3">Switch team</h2>
        <ul className="space-y-1">
          {teams.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => handleSwitch(t.id)}
                disabled={switching}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition
                  ${t.id === currentTeamId
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'hover:bg-gray-100 text-gray-800'}`}
              >
                {t.name}
                {t.id === currentTeamId && <span className="ml-1 text-xs font-normal opacity-70">(active)</span>}
              </button>
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { user, logout, switchTeam } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isRoot = ROOT_PATHS.has(location.pathname);
  const isAbout = location.pathname === '/about';
  // The About pill gets a subtle blue tint on every page except Hall of Fame / Profile.
  const blueAbout = !['/hall-of-fame', '/profile'].includes(location.pathname);

  const [myTeams, setMyTeams] = useState([]);
  const [showSwitcher, setShowSwitcher] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyTeams().then(({ data }) => setMyTeams(data)).catch(() => {});
  }, [user?.active_team_id]);

  const isCoach = user?.role === 'coach' || user?.role === 'admin';
  const canSwitch = isCoach && myTeams.length > 1;
  const teamName = user?.active_team_name;

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <header className={`shrink-0 z-40 border-b border-white/10 text-white px-4 py-3 flex items-center justify-between ${isAbout ? 'bg-black' : 'bg-black/40 backdrop-blur-md'}`}>
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
            className={`ml-1 text-xs font-medium rounded-full px-3 py-1 transition ${blueAbout ? 'bg-[#363a52] hover:bg-[#454a68]' : 'bg-[#353436] hover:bg-[#454446]'}`}
          >
            About
          </button>
          <button
            onClick={() => navigate('/info')}
            className={`text-xs font-medium rounded-full px-3 py-1 transition ${blueAbout ? 'bg-[#363a52] hover:bg-[#454a68]' : 'bg-[#353436] hover:bg-[#454446]'}`}
          >
            Info
          </button>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {teamName && (
            canSwitch ? (
              <button
                onClick={() => setShowSwitcher(true)}
                className="text-xs font-medium bg-[#353436] hover:bg-[#454446] rounded-full px-3 py-1 transition flex items-center gap-1"
                title="Switch team"
              >
                {teamName}
                <span className="opacity-60 text-[10px]">▾</span>
              </button>
            ) : (
              <span className="text-xs opacity-70 hidden sm:inline">{teamName}</span>
            )
          )}
          <StravaSyncIconButton />
          <NotificationBell />
          <span className="opacity-80 hidden sm:inline">{user?.full_name}</span>
          <button onClick={logout} className="underline opacity-70 hover:opacity-100">
            Logout
          </button>
        </div>
      </header>

      {/* Only this div scrolls — header is always visible, dock floats over it.
          pb-28 keeps the last content clear of the floating dock. */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 pb-28 max-w-2xl mx-auto w-full">
          <Outlet />
        </div>
      </div>

      {/* Bottom fade: content softly dissolves into the dark before it reaches
          the floating dock, so scrolled cards never show sharply behind it. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-24 z-30 bg-gradient-to-t from-[#131314] via-[#131314]/85 to-transparent" />

      <BottomNav />

      {showSwitcher && (
        <TeamSwitcherModal
          teams={myTeams}
          currentTeamId={user?.active_team_id}
          onSwitch={switchTeam}
          onClose={() => setShowSwitcher(false)}
        />
      )}
    </div>
  );
}
