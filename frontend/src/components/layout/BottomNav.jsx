import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { incomingRequests } from '../../api/coaching';
import { listPending } from '../../api/adminReview';
import { FloatingDock } from '../ui/FloatingDock';

// Drop JPGs/PNGs into frontend/public/icons/ to replace emojis. See README there.
const athletePairedItems = [
  { to: '/home',          label: 'Home',        icon: '🎟️', image: '/icons/home.jpg' },
  { to: '/calendar',      label: 'Training log', icon: '🏋️', image: '/icons/training.jpg' },
  { to: '/feed',          label: 'Feed',        icon: '📢', image: '/icons/feed.jpg' },
  { to: '/races',         label: 'Races',       icon: '🏆', image: '/icons/races.jpg' },
  { to: '/hall-of-fame',  label: 'Hall of Fame',icon: '🥇', image: '/icons/hall-of-fame.jpg' },
  { to: '/health-wellness', label: 'Health',    icon: '🏥', image: '/icons/health.jpg' },
  { to: '/profile',       label: 'Profile',     icon: '👤', image: '/icons/profile.jpg' },
];

const athleteUnpairedItems = [
  { to: '/find-coach',    label: 'Find coach',  icon: '🔎', image: '/icons/find-coach.jpg' },
  { to: '/calendar',      label: 'Training log', icon: '🏋️', image: '/icons/training.jpg' },
  { to: '/feed',          label: 'Feed',        icon: '📢', image: '/icons/feed.jpg' },
  { to: '/races',         label: 'Races',       icon: '🏆', image: '/icons/races.jpg' },
  { to: '/hall-of-fame',  label: 'Hall of Fame',icon: '🥇', image: '/icons/hall-of-fame.jpg' },
  { to: '/health-wellness', label: 'Health',    icon: '🏥', image: '/icons/health.jpg' },
  { to: '/profile',       label: 'Profile',     icon: '👤', image: '/icons/profile.jpg' },
];

const coachItems = [
  { to: '/coach/dashboard',    label: 'Tracking',    icon: '📊', image: '/icons/tracking.jpg' },
  { to: '/coach/workouts',     label: 'Coach',       icon: '📋', image: '/icons/coach.jpg' },
  { to: '/coach/requests',     label: 'Requests',    icon: '📥', image: '/icons/requests.jpg', isRequests: true },
  { to: '/coach/reporting',    label: 'Reporting',   icon: '📈', image: '/icons/reporting.jpg' },
  { to: '/coach/analytics',    label: 'Analytics',   icon: '📉', image: '/icons/analytics.jpg' },
  { to: '/coach/group-coaches',label: 'Co-coaches',  icon: '👥', image: '/icons/group-coaches.jpg' },
  { to: '/feed',               label: 'Feed',        icon: '📢', image: '/icons/feed.jpg' },
  { to: '/races',              label: 'Races',       icon: '🏆', image: '/icons/races.jpg' },
  { to: '/hall-of-fame',       label: 'Hall of Fame',icon: '🥇', image: '/icons/hall-of-fame.jpg' },
  { to: '/health-wellness',    label: 'Health',      icon: '🏥', image: '/icons/health.jpg' },
  { to: '/profile',            label: 'Profile',     icon: '👤', image: '/icons/profile.jpg' },
];

const adminItems = [
  { to: '/coach/dashboard',    label: 'Tracking',    icon: '📊', image: '/icons/tracking.jpg' },
  { to: '/coach/workouts',     label: 'Coach',       icon: '📋', image: '/icons/coach.jpg' },
  { to: '/coach/requests',     label: 'Requests',    icon: '📥', image: '/icons/requests.jpg', isRequests: true },
  { to: '/coach/reporting',    label: 'Reporting',   icon: '📈', image: '/icons/reporting.jpg' },
  { to: '/coach/analytics',    label: 'Analytics',   icon: '📉', image: '/icons/analytics.jpg' },
  { to: '/coach/group-coaches',label: 'Co-coaches',  icon: '👥', image: '/icons/group-coaches.jpg' },
  { to: '/admin/pending',      label: 'Review',      icon: '⚖️', image: '/icons/review.jpg', isPending: true },
  { to: '/admin/users',        label: 'Users',       icon: '👥', image: '/icons/users.jpg' },
  { to: '/feed',               label: 'Feed',        icon: '📢', image: '/icons/feed.jpg' },
  { to: '/races',              label: 'Races',       icon: '🏆', image: '/icons/races.jpg' },
  { to: '/hall-of-fame',       label: 'Hall of Fame',icon: '🥇', image: '/icons/hall-of-fame.jpg' },
  { to: '/health-wellness',    label: 'Health',      icon: '🏥', image: '/icons/health.jpg' },
  { to: '/profile',            label: 'Profile',     icon: '👤', image: '/icons/profile.jpg' },
];

export default function BottomNav() {
  const { user, photoVersion } = useAuth();
  const isCoachOrAdmin = user?.role === 'coach' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';
  const [pendingCount, setPendingCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  const profilePhotoUrl = user?.id && user?.has_photo
    ? `/api/v1/profile/photo/${user.id}?v=${photoVersion}`
    : null;

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
    image: item.to === '/profile' && profilePhotoUrl ? profilePhotoUrl : item.image,
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
