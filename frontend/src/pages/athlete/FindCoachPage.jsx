import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCoaches, getMyPairing, requestCoach, withdrawRequest } from '../../api/coaching';
import { useAuth } from '../../contexts/AuthContext';
import Spinner from '../../components/ui/Spinner';

export default function FindCoachPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [coaches, setCoaches] = useState([]);
  const [pairing, setPairing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [cs, p] = await Promise.all([listCoaches(), getMyPairing()]);
      setCoaches(cs.data);
      setPairing(p.data);
      if (p.data.coach_id) {
        // Already paired → bounce to home (e.g. coach just accepted while page was open).
        navigate('/home', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleRequest = async (coachId) => {
    setActing(true);
    try {
      await requestCoach(coachId);
      await refresh();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Could not send request';
      alert(msg);
    } finally {
      setActing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!pairing?.pending_request) return;
    if (!confirm('Withdraw your request?')) return;
    setActing(true);
    try {
      await withdrawRequest(pairing.pending_request.id);
      await refresh();
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner /></div>;
  }

  const pending = pairing?.pending_request;

  return (
    <div className="pb-8">
      <div className="mb-5 px-1">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Welcome, {user?.full_name}</p>
        <h2 className="text-2xl font-extrabold text-gray-900 mt-1">Find your coach</h2>
        <p className="text-sm text-gray-600 mt-2">
          Send a join request to a coach. Once they accept, you'll receive their workouts and tracking.
        </p>
      </div>

      {pending && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4">
          <p className="text-xs uppercase tracking-wider text-amber-800 font-semibold mb-1">Request pending</p>
          <p className="text-sm text-gray-900">Waiting for <span className="font-semibold">{pending.coach_name}</span> to accept.</p>
          <button
            onClick={handleWithdraw}
            disabled={acting}
            className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            Withdraw request
          </button>
        </div>
      )}

      {coaches.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500">
          No coaches available yet. Check back soon.
        </div>
      ) : (
        <div className="space-y-2">
          {coaches.map((c) => {
            const isPendingThis = pending && pending.coach_id === c.id;
            return (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{c.full_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.athlete_count} athlete{c.athlete_count === 1 ? '' : 's'} · @{c.username}
                  </p>
                </div>
                <button
                  onClick={() => handleRequest(c.id)}
                  disabled={acting || !!pending}
                  className="shrink-0 ml-3 text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-40"
                >
                  {isPendingThis ? 'Pending…' : 'Request to join'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 bg-gray-50 rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">What you can do meanwhile</p>
        <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">
          <li>Log your own workouts in the Training tab</li>
          <li>Browse races and the Hall of Fame</li>
          <li>See health & wellness contacts</li>
          <li>Edit your profile</li>
        </ul>
      </div>
    </div>
  );
}
