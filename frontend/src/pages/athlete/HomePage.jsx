import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHomeSummary } from '../../api/home';
import { useAuth } from '../../contexts/AuthContext';
import TrainingTicket from '../../components/TrainingTicket';
import AnimatedWelcome from '../../components/AnimatedWelcome';
import Spinner from '../../components/ui/Spinner';

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Athletes without a coach belong on /find-coach, not the home ticket.
  useEffect(() => {
    if (user?.role === 'athlete' && !user?.coach_id) {
      navigate('/find-coach', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (user?.role === 'athlete' && !user?.coach_id) return;
    let alive = true;
    setLoading(true);
    const fetchSummary = () => getHomeSummary()
      .then(({ data }) => alive && setSummary(data))
      .catch(() => {});
    fetchSummary().finally(() => alive && setLoading(false));
    const onSync = () => fetchSummary();
    window.addEventListener('strava-synced', onSync);
    return () => {
      alive = false;
      window.removeEventListener('strava-synced', onSync);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="text-center py-20 text-gray-500">
        Could not load your home summary.
      </div>
    );
  }

  const hasWorkout = !!(summary.today?.group_workout || summary.today?.individual_target);
  const handleOpen = () => {
    navigate(hasWorkout ? '/calendar?open=today' : '/calendar');
  };

  const bgUrl = '/bg.jpg';

  return (
    <div className="relative pb-8">
      {bgUrl && (
        <>
          <div
            className="fixed inset-0 -z-10 bg-cover bg-center"
            style={{ backgroundImage: `url(${bgUrl})` }}
          />
          {/* ↓ TUNE OVERLAY DARKNESS HERE — raise the number to darken, lower to show more photo */}
          <div className="fixed inset-0 -z-10 bg-black/45" />
        </>
      )}
      <div className="mb-3 px-1">
        <p className={`text-sm font-semibold uppercase tracking-widest ${bgUrl ? 'text-blue-200' : 'text-blue-600'}`}>Welcome back,</p>
        <div className="mt-1">
          <AnimatedWelcome name={user?.full_name || 'Runner'} color={bgUrl ? '#ffffff' : undefined} />
        </div>
      </div>

      <TrainingTicket
        today={summary.today}
        weekKm={summary.week_distance_km}
        runs={{
          week:  summary.runs_completed_week,
          month: summary.runs_completed_month,
          total: summary.runs_completed_total,
        }}
        lastRace={summary.last_race}
        group={summary.group}
        onOpenWorkout={handleOpen}
        hasBgImage={!!bgUrl}
      />
    </div>
  );
}
