import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { incomingRequests, acceptRequest, declineRequest } from '../../api/coaching';
import Spinner from '../../components/ui/Spinner';

export default function CoachRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  // The request the coach is about to decline. null = sheet closed.
  const [declineTarget, setDeclineTarget] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await incomingRequests();
      setRequests(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleAccept = async (id) => {
    setActing(true);
    try {
      await acceptRequest(id);
      await refresh();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not accept');
    } finally {
      setActing(false);
    }
  };

  const confirmDecline = async () => {
    if (!declineTarget) return;
    setActing(true);
    try {
      await declineRequest(declineTarget.id);
      setDeclineTarget(null);
      await refresh();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not decline');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner /></div>;
  }

  return (
    <div>
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950" />
      <h2 className="text-xl font-bold mb-4 text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">Join requests</h2>
      {requests.length === 0 ? (
        <div className="text-center py-12 text-sm text-white/60">
          No pending requests.
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="bg-white/20 backdrop-blur-sm rounded-xl border border-white/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{r.athlete_name}</p>
                  <p className="text-xs text-white/65 mt-0.5">
                    Sent {format(new Date(r.created_at), 'MMM d, HH:mm')}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setDeclineTarget(r)}
                    disabled={acting}
                    className="text-xs px-3 py-1.5 rounded-lg border border-white/25 text-white/80 hover:bg-white/10 disabled:opacity-50 transition"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => handleAccept(r.id)}
                    disabled={acting}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:opacity-50 transition"
                  >
                    Accept
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Decline-confirm sheet — bottom sheet on small screens, centered card on larger */}
      {declineTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => !acting && setDeclineTarget(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl shrink-0">✕</div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-gray-900">
                  Decline {declineTarget.athlete_name}'s request?
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  They won't be added to your roster. They can send another request to you (or to a different coach) later.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeclineTarget(null)}
                disabled={acting}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold active:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDecline}
                disabled={acting}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold active:bg-red-700 shadow-sm disabled:opacity-50"
              >
                {acting ? 'Declining…' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
