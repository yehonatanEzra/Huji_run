import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHomeSummary } from '../../api/home';
import { useAuth } from '../../contexts/AuthContext';
import TrainingTicket from '../../components/TrainingTicket';
import Spinner from '../../components/ui/Spinner';

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  // Bumps every 3s to remount the name and replay the letter-reveal animation.
  const [nameTick, setNameTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNameTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

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
      {/* Track background + dark hero gradient (designer's training-log look) */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes gentleFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes letterReveal {
          from { opacity: 0; filter: blur(8px); transform: translateY(10px); }
          to   { opacity: 1; filter: blur(0);  transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.8s ease-out forwards;
        }
        .animate-gentle-float {
          animation: gentleFloat 4s ease-in-out infinite;
        }
        .animate-letter-reveal {
          animation: letterReveal 0.7s ease-out forwards;
        }
      `}</style>

      {bgUrl && (
        <>
          <div
            className="fixed inset-0 -z-10 bg-cover bg-center"
            style={{ backgroundImage: `url(${bgUrl})` }}
          />
          {/* Match the feed / training-log darkness level */}
          <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.45) 0%, rgba(0,0,0,0.50) 100%)' }} />
        </>
      )}

      {/* Welcome message — "Welcome back," fades in first, then the name
          reveals letter by letter; the whole block replays every 3s. */}
      <div key={nameTick} className="mb-3 px-1">
        <p className={`text-sm font-semibold uppercase tracking-widest opacity-0 animate-fade-in-up ${bgUrl ? 'text-blue-200' : 'text-blue-600'}`}>
          Welcome back,
        </p>
        {/*athlete name */}
        <h1 className="mt-1 text-3xl font-black text-blue-300 [text-shadow:0_2px_12px_rgba(0,8,0,0.6)] inline-block">
          {(user?.full_name || 'Runner').split('').map((ch, i) => (
            <span
              key={i}
              className="inline-block opacity-0 animate-letter-reveal"
              style={{ animationDelay: `${0.9 + i * 0.09}s`, whiteSpace: 'pre' }}
            >
              {ch}
            </span>
          ))}
        </h1>
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