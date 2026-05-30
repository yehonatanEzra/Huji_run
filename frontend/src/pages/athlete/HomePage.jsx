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
    getHomeSummary()
      .then(({ data }) => alive && setSummary(data))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
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

  return (
    <div className="pb-8">
      <div className="mb-6 px-1">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Welcome back,</p>
        <div className="mt-1">
          <AnimatedWelcome name={user?.full_name || 'Runner'} />
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
      />
    </div>
  );
}
