import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { incomingRequests } from '../../api/coaching';
import { listPending } from '../../api/adminReview';
import { FloatingDock } from '../ui/FloatingDock';

const athletePairedItems = [
  { to: '/home',          label: 'Home',        icon: '🎟️' },
  { to: '/calendar',      label: 'Training',    icon: '🏋️' },
  { to: '/feed',          label: 'Feed',        icon: '📢' },
  { to: '/races',         label: 'Races',       icon: '🏆' },
  { to: '/hall-of-fame',  label: 'Hall of Fame',icon: '🥇' },
  { to: '/health-wellness', label: 'Health',    icon: '🏥' },
  { to: '/profile',       label: 'Profile',     icon: '👤' },
];

const athleteUnpairedItems = [
  { to: '/find-coach',    label: 'Find coach',  icon: '🔎' },
  { to: '/calendar',      label: 'Training',    icon: '🏋️' },
  { to: '/feed',          label: 'Feed',        icon: '📢' },
  { to: '/races',         label: 'Races',       icon: '🏆' },
  { to: '/hall-of-fame',  label: 'Hall of Fame',icon: '🥇' },
  { to: '/health-wellness', label: 'Health',    icon: '🏥' },
  { to: '/profile',       label: 'Profile',     icon: '👤' },
];

const coachItems = [
  { to: '/coach/dashboard', label: 'Tracking',  icon: '📊' },
  { to: '/coach/workouts',  label: 'Coach',     icon: '📋' },
  { to: '/coach/requests',  label: 'Requests',  icon: '📥', isRequests: true },
  { to: '/feed',            label: 'Feed',      icon: '📢' },
  { to: '/races',           label: 'Races',     icon: '🏆' },
  { to: '/hall-of-fame',    label: 'Hall of Fame', icon: '🥇' },
  { to: '/health-wellness', label: 'Health',    icon: '🏥' },
  { to: '/profile',         label: 'Profile',   icon: '👤' },
];

const adminItems = [
  { to: '/coach/dashboard', label: 'Tracking',  icon: '📊' },
  { to: '/coach/workouts',  label: 'Coach',     icon: '📋' },
  { to: '/coach/requests',  label: 'Requests',  icon: '📥', isRequests: true },
  { to: '/admin/pending',   label: 'Review',    icon: '⚖️', isPending: true },
  { to: '/feed',            label: 'Feed',      icon: '📢' },
  { to: '/races',           label: 'Races',     icon: '🏆' },
  { to: '/hall-of-fame',    label: 'Hall of Fame', icon: '🥇' },
  { to: '/health-wellness', label: 'Health',    icon: '🏥' },
  { to: '/profile',         label: 'Profile',   icon: '👤' },
];

export default function BottomNav() {
  const { user } = useAuth();
  const isCoachOrAdmin = user?.role === 'coach' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';
  const [pendingCount, setPendingCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

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

  const baseItems = isAdmin
    ? adminItems
    : isCoachOrAdmin
      ? coachItems
      : (user?.coach_id ? athletePairedItems : athleteUnpairedItems);

  const items = baseItems.map((item) => ({
    ...item,
    badge: item.isRequests ? pendingCount : item.isPending ? reviewCount : 0,
  }));

  return (
    <div className="shrink-0 flex justify-center py-2 px-4">
      <div className="overflow-x-auto scrollbar-hide max-w-full">
        <FloatingDock items={items} />
      </div>
    </div>
  );
}
