import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { incomingRequests, incomingTransfers } from '../../api/coaching';
import { listIncomingCoachInvites } from '../../api/groupCoach';
import { pendingApprovalsCount } from '../../api/coach';
import { listPending } from '../../api/adminReview';
import { FloatingDock } from '../ui/FloatingDock';
import { NAV_ICONS } from './navIcons';

// Drop JPGs/PNGs into frontend/public/icons/ to replace emojis. See README there.
const athletePairedItems = [
  { to: '/home',          label: 'Home',        icon: '🎟️', image: '/icons/home.jpg' },
  { to: '/calendar',      label: 'Training log', icon: '🏋️', image: '/icons/training.jpg' },
  { to: '/feed',          label: 'Feed',        icon: '📢', image: '/icons/feed.jpg' },
  { to: '/races',         label: 'Races',       icon: '🏆', image: '/icons/races.jpg' },
  { to: '/health-wellness', label: 'Health',    icon: '🏥', image: '/icons/health.jpg' },
  { to: '/hall-of-fame',  label: 'Hall of Fame',icon: '🥇', image: '/icons/hall-of-fame.jpg' },
  { to: '/profile',       label: 'Profile',     icon: '👤', image: '/icons/profile.jpg', isTransfer: true },
];

const athleteUnpairedItems = [
  { to: '/find-coach',    label: 'Find coach',  icon: '🔎', image: '/icons/find-coach.jpg' },
  { to: '/calendar',      label: 'Training log', icon: '🏋️', image: '/icons/training.jpg' },
  { to: '/feed',          label: 'Feed',        icon: '📢', image: '/icons/feed.jpg' },
  { to: '/races',         label: 'Races',       icon: '🏆', image: '/icons/races.jpg' },
  { to: '/health-wellness', label: 'Health',    icon: '🏥', image: '/icons/health.jpg' },
  { to: '/hall-of-fame',  label: 'Hall of Fame',icon: '🥇', image: '/icons/hall-of-fame.jpg' },
  { to: '/profile',       label: 'Profile',     icon: '👤', image: '/icons/profile.jpg' },
];

const coachItems = [
  { to: '/coach/home',         label: 'Home',        icon: '🏠', image: '/icons/home.jpg' },
  { to: '/coach/dashboard',    label: 'Tracking',    icon: '📊', image: '/icons/tracking.jpg' },
  { to: '/coach/group',        label: 'Group',       icon: '👥', image: '/icons/group.jpg', isGroupApprovals: true },
  { to: '/coach/settings',     label: 'Athletes',    icon: '🧑‍🤝‍🧑', image: '/icons/athletes.jpg' },
  { to: '/coach/plans',        label: 'Plans',       icon: '🗓️', image: '/icons/plans.jpg' },
  { to: '/coach/requests',     label: 'Requests',    icon: '📥', image: '/icons/requests.jpg', isRequests: true },
  { to: '/feed',               label: 'Feed',        icon: '📢', image: '/icons/feed.jpg' },
  { to: '/races',              label: 'Races',       icon: '🏆', image: '/icons/races.jpg' },
  { to: '/health-wellness',    label: 'Health',      icon: '🏥', image: '/icons/health.jpg' },
  { to: '/hall-of-fame',       label: 'Hall of Fame',icon: '🥇', image: '/icons/hall-of-fame.jpg' },
  { to: '/profile',            label: 'Profile',     icon: '👤', image: '/icons/profile.jpg' },
];

const adminItems = [
  { to: '/coach/home',         label: 'Home',        icon: '🏠', image: '/icons/home.jpg' },
  { to: '/coach/dashboard',    label: 'Tracking',    icon: '📊', image: '/icons/tracking.jpg' },
  { to: '/coach/group',        label: 'Group',       icon: '👥', image: '/icons/group.jpg', isGroupApprovals: true },
  { to: '/coach/settings',     label: 'Athletes',    icon: '🧑‍🤝‍🧑', image: '/icons/athletes.jpg' },
  { to: '/coach/plans',        label: 'Plans',       icon: '🗓️', image: '/icons/plans.jpg' },
  { to: '/coach/requests',     label: 'Requests',    icon: '📥', image: '/icons/requests.jpg', isRequests: true },
  { to: '/feed',               label: 'Feed',        icon: '📢', image: '/icons/feed.jpg' },
  { to: '/races',              label: 'Races',       icon: '🏆', image: '/icons/races.jpg' },
  { to: '/health-wellness',    label: 'Health',      icon: '🏥', image: '/icons/health.jpg' },
  { to: '/hall-of-fame',       label: 'Hall of Fame',icon: '🥇', image: '/icons/hall-of-fame.jpg' },
  { to: '/profile',            label: 'Profile',     icon: '👤', image: '/icons/profile.jpg' },
  { to: '/admin',              label: 'Admin',       icon: '⚖️', image: '/icons/review.jpg', isPending: true },
];

export default function BottomNav() {
  const { user, photoVersion } = useAuth();
  const isCoachOrAdmin = user?.role === 'coach' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';
  const isAthlete = user?.role === 'athlete';
  const [pendingCount, setPendingCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [groupApprovalCount, setGroupApprovalCount] = useState(0);
  const [transferCount, setTransferCount] = useState(0);

  const profilePhotoUrl = user?.id && user?.has_photo
    ? `/api/v1/profile/photo/${user.id}?v=${photoVersion}`
    : null;

  const fetchRequests = useCallback(() => {
    if (!isCoachOrAdmin) return;
    // The Requests tab aggregates join requests + co-coach invitations +
    // incoming athlete transfers (where I'm the destination coach).
    Promise.all([
      incomingRequests().then((r) => r.data.length).catch(() => 0),
      listIncomingCoachInvites().then((r) => r.data.length).catch(() => 0),
      incomingTransfers().then((r) => r.data.filter((t) => t.to_coach_id === user?.id).length).catch(() => 0),
    ]).then(([a, b, c]) => setPendingCount(a + b + c));
  }, [isCoachOrAdmin, user?.id]);

  const fetchReview = useCallback(() => {
    if (!isAdmin) return;
    listPending().then(({ data }) => setReviewCount((data.races?.length || 0) + (data.results?.length || 0))).catch(() => {});
  }, [isAdmin]);

  const fetchGroupApprovals = useCallback(() => {
    if (!isCoachOrAdmin) return;
    pendingApprovalsCount().then(({ data }) => setGroupApprovalCount(data.count || 0)).catch(() => {});
  }, [isCoachOrAdmin]);

  const fetchTransfers = useCallback(() => {
    if (!isAthlete) return;
    incomingTransfers().then(({ data }) => setTransferCount(data.filter((t) => t.athlete_id === user?.id).length)).catch(() => {});
  }, [isAthlete, user?.id]);

  useEffect(() => {
    fetchRequests();
    const intv = setInterval(fetchRequests, 30_000);
    return () => clearInterval(intv);
  }, [fetchRequests]);

  useEffect(() => {
    fetchReview();
    const intv = setInterval(fetchReview, 30_000);
    return () => clearInterval(intv);
  }, [fetchReview]);

  useEffect(() => {
    fetchGroupApprovals();
    const intv = setInterval(fetchGroupApprovals, 30_000);
    return () => clearInterval(intv);
  }, [fetchGroupApprovals]);

  useEffect(() => {
    fetchTransfers();
    const intv = setInterval(fetchTransfers, 30_000);
    return () => clearInterval(intv);
  }, [fetchTransfers]);

  // Refresh badges immediately when a coach/admin acts (accept/decline a join
  // request, approve a group add, moderate a race) instead of waiting for the
  // 30s poll. The acting page dispatches `badges:refresh` after its own refresh.
  useEffect(() => {
    const h = () => { fetchRequests(); fetchReview(); fetchGroupApprovals(); fetchTransfers(); };
    window.addEventListener('badges:refresh', h);
    return () => window.removeEventListener('badges:refresh', h);
  }, [fetchRequests, fetchReview, fetchGroupApprovals, fetchTransfers]);

  const baseItems = isAdmin
    ? adminItems
    : isCoachOrAdmin
      ? coachItems
      : (user?.coach_id ? athletePairedItems : athleteUnpairedItems);

  const items = baseItems.map((item) => ({
    ...item,
    svg: NAV_ICONS[item.to],
    // Line icons everywhere; keep the athlete's real photo only on the Profile tab.
    image: item.to === '/profile' ? profilePhotoUrl : undefined,
    badge: item.isRequests ? pendingCount : item.isPending ? reviewCount : item.isGroupApprovals ? groupApprovalCount : item.isTransfer ? transferCount : 0,
  }));

  return (
    // Floating dock — detached from the bottom edge, hovers over the content.
    // pointer-events-none on the wrapper lets taps pass through the empty sides;
    // the dock itself re-enables them.
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-4 pointer-events-none">
      <div className="overflow-x-auto scrollbar-hide max-w-full pointer-events-auto">
        <FloatingDock items={items} />
      </div>
    </div>
  );
}
