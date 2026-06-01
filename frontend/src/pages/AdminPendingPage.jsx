import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { listPending, approveRace, rejectRace, approveResult, rejectResult } from '../api/adminReview';
import Spinner from '../components/ui/Spinner';

export default function AdminPendingPage() {
  const [pending, setPending] = useState({ races: [], results: [] });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  // Reject sheet state: { kind: 'race' | 'result', item, note }
  const [rejectTarget, setRejectTarget] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await listPending();
      setPending(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleApprove = async (kind, item) => {
    setActing(true);
    try {
      if (kind === 'race') await approveRace(item.id);
      else await approveResult(item.id);
      await refresh();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not approve');
    } finally {
      setActing(false);
    }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    setActing(true);
    try {
      const { kind, item, note } = rejectTarget;
      if (kind === 'race') await rejectRace(item.id, note || null);
      else await rejectResult(item.id, note || null);
      setRejectTarget(null);
      await refresh();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not reject');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner /></div>;
  }

  const empty = pending.races.length === 0 && pending.results.length === 0;

  return (
    <div className="pb-8">
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950" />
      <h2 className="text-xl font-bold mb-1 text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">Pending review</h2>
      <p className="text-xs text-white/65 mb-5">
        Approve coach submissions before they go live in the race archive and Hall of Fame.
      </p>

      {empty ? (
        <div className="text-center py-12 text-sm text-white/60">
          No pending items right now.
        </div>
      ) : (
        <>
          {pending.races.length > 0 && (
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-white/85 mb-2">
                Races <span className="text-white/50">({pending.races.length})</span>
              </h3>
              <div className="space-y-2">
                {pending.races.map((r) => (
                  <div key={r.id} className="bg-white/20 backdrop-blur-sm rounded-xl border border-white/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{r.name}</p>
                        <p className="text-xs text-white/65 mt-0.5">
                          {format(new Date(r.race_date + 'T00:00'), 'MMM d, yyyy')} · proposed by {r.proposer_name}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setRejectTarget({ kind: 'race', item: r, note: '' })}
                          disabled={acting}
                          className="text-xs px-3 py-1.5 rounded-lg border border-white/25 text-white/80 hover:bg-white/10 disabled:opacity-50 transition"
                        >Reject</button>
                        <button
                          onClick={() => handleApprove('race', r)}
                          disabled={acting}
                          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:opacity-50 transition"
                        >Approve</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {pending.results.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-white/85 mb-2">
                Results <span className="text-white/50">({pending.results.length})</span>
              </h3>
              <div className="space-y-2">
                {pending.results.map((res) => (
                  <div key={res.id} className="bg-white/20 backdrop-blur-sm rounded-xl border border-white/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{res.athlete_name}</p>
                        <p className="text-sm text-white/90 font-mono mt-0.5">
                          {res.time_display} · {res.distance_m}m
                        </p>
                        <p className="text-xs text-white/65 mt-1">
                          {res.race_name} · {res.heat_label}
                          {res.proposer_name && <> · proposed by {res.proposer_name}</>}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setRejectTarget({ kind: 'result', item: res, note: '' })}
                          disabled={acting}
                          className="text-xs px-3 py-1.5 rounded-lg border border-white/25 text-white/80 hover:bg-white/10 disabled:opacity-50 transition"
                        >Reject</button>
                        <button
                          onClick={() => handleApprove('result', res)}
                          disabled={acting}
                          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:opacity-50 transition"
                        >Approve</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Reject sheet — bottom on mobile, centered on desktop */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => !acting && setRejectTarget(null)}
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
                  Reject {rejectTarget.kind === 'race' ? 'race' : 'result'}?
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  The proposer will see your note in their drafts. They can edit and resubmit.
                </p>
              </div>
            </div>
            <textarea
              value={rejectTarget.note}
              onChange={(e) => setRejectTarget({ ...rejectTarget, note: e.target.value })}
              placeholder="Reason (optional)"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRejectTarget(null)}
                disabled={acting}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold active:bg-gray-50 disabled:opacity-50"
              >Cancel</button>
              <button
                onClick={submitReject}
                disabled={acting}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold active:bg-red-700 shadow-sm disabled:opacity-50"
              >{acting ? 'Rejecting…' : 'Reject'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
