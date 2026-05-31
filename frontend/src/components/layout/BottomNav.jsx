import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { incomingRequests } from '../../api/coaching';
import { listPending } from '../../api/adminReview';

const athletePairedItems = [
  { to: '/home', label: 'Home', icon: '🎟️' },
  { to: '/calendar', label: 'Training', icon: '🏋️' },
  { to: '/feed', label: 'Feed', icon: '📢' },
  { to: '/races', label: 'Races', icon: '🏆' },
  { to: '/hall-of-fame', label: 'Hall of Fame', icon: '🥇' },
  { to: '/health-wellness', label: 'Health', icon: '🏥' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

const athleteUnpairedItems = [
  { to: '/find-coach', label: 'Find coach', icon: '🔎' },
  { to: '/calendar', label: 'Training', icon: '🏋️' },
  { to: '/feed', label: 'Feed', icon: '📢' },
  { to: '/races', label: 'Races', icon: '🏆' },
  { to: '/hall-of-fame', label: 'Hall of Fame', icon: '🥇' },
  { to: '/health-wellness', label: 'Health', icon: '🏥' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

const coachItems = [
  { to: '/coach/dashboard', label: 'Tracking', icon: '📊' },
  { to: '/coach/workouts', label: 'Coach', icon: '📋' },
  { to: '/coach/requests', label: 'Requests', icon: '📥', isRequests: true },
  { to: '/feed', label: 'Feed', icon: '📢' },
  { to: '/races', label: 'Races', icon: '🏆' },
  { to: '/hall-of-fame', label: 'Hall of Fame', icon: '🥇' },
  { to: '/health-wellness', label: 'Health', icon: '🏥' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

const adminItems = [
  { to: '/coach/dashboard', label: 'Tracking', icon: '📊' },
  { to: '/coach/workouts', label: 'Coach', icon: '📋' },
  { to: '/coach/requests', label: 'Requests', icon: '📥', isRequests: true },
  { to: '/admin/pending', label: 'Review', icon: '⚖️', isPending: true },
  { to: '/feed', label: 'Feed', icon: '📢' },
  { to: '/races', label: 'Races', icon: '🏆' },
  { to: '/hall-of-fame', label: 'Hall of Fame', icon: '🥇' },
  { to: '/health-wellness', label: 'Health', icon: '🏥' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

export default function BottomNav() {
  const { user } = useAuth();
  const isCoachOrAdmin = user?.role === 'coach' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';
  const [pendingCount, setPendingCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  // Poll incoming-requests count for coach/admin so a badge can show.
  useEffect(() => {
    if (!isCoachOrAdmin) return;
    let alive = true;
    const fetchCount = () => incomingRequests()
      .then(({ data }) => alive && setPendingCount(data.length))
      .catch(() => {});
    fetchCount();
    const intv = setInterval(fetchCount, 30_000);
    return () => { alive = false; clearInterval(intv); };
  }, [isCoachOrAdmin]);

  // Admin only: poll the pending-review queue for the Review badge.
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const fetchCount = () => listPending()
      .then(({ data }) => alive && setReviewCount((data.races?.length || 0) + (data.results?.length || 0)))
      .catch(() => {});
    fetchCount();
    const intv = setInterval(fetchCount, 30_000);
    return () => { alive = false; clearInterval(intv); };
  }, [isAdmin]);

  const items = isAdmin
    ? adminItems
    : isCoachOrAdmin
      ? coachItems
      : (user?.coach_id ? athletePairedItems : athleteUnpairedItems);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex overflow-x-auto scrollbar-hide items-center h-16 px-1">
        {items.map(({ to, label, icon, isRequests, isPending }) => {
          const badge = isRequests ? pendingCount : isPending ? reviewCount : 0;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 text-xs transition-colors flex-shrink-0 min-w-[64px] px-1 ${
                  isActive ? 'text-blue-600 font-semibold' : 'text-gray-500'
                }`
              }
            >
              <span className="text-xl">{icon}</span>
              <span>{label}</span>
              {badge > 0 && (
                <span className="absolute top-0 right-2 bg-red-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[16px] text-center leading-tight">
                  {badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
