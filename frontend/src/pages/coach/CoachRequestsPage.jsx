import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import {
  incomingRequests, acceptRequest, declineRequest,
  incomingTransfers, approveTransfer, declineTransfer,
} from '../../api/coaching';
import { listIncomingCoachInvites, acceptCoachInvite, declineCoachInvite } from '../../api/groupCoach';
import Spinner from '../../components/ui/Spinner';

export default function CoachRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [invites, setInvites] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  // The request the coach is about to decline. null = sheet closed.
  const [declineTarget, setDeclineTarget] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [reqs, invs, trs] = await Promise.all([
        incomingRequests().then((r) => r.data).catch(() => []),
        listIncomingCoachInvites().then((r) => r.data).catch(() => []),
        incomingTransfers().then((r) => r.data).catch(() => []),
      ]);
      setRequests(reqs);
      setInvites(invs);
      // On the coach page act only as the destination coach (not as an athlete).
      setTransfers(trs.filter((t) => t.to_coach_id === user?.id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const inviteAct = async (id, accept) => {
    setActing(true);
    try {
      await (accept ? acceptCoachInvite(id) : declineCoachInvite(id));
      await refresh();
      window.dispatchEvent(new Event('badges:refresh'));
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not update invitation');
    } finally { setActing(false); }
  };

  const transferAct = async (id, accept) => {
    setActing(true);
    try {
      await (accept ? approveTransfer(id) : declineTransfer(id));
      await refresh();
      window.dispatchEvent(new Event('badges:refresh'));
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not update transfer');
    } finally { setActing(false); }
  };

  const handleAccept = async (id) => {
    setActing(true);
    try {
      await acceptRequest(id);
      await refresh();
      window.dispatchEvent(new Event('badges:refresh'));
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
      window.dispatchEvent(new Event('badges:refresh'));
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
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />
      {/* Co-coach invitations addressed to me */}
      {invites.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-3 text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">Co-coach invitations</h2>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="bg-white/20 backdrop-blur-sm rounded-xl border border-white/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{inv.group_name}</p>
                    <p className="text-xs text-white/65 mt-0.5">{inv.invited_by_name} invited you to co-coach</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => inviteAct(inv.id, false)} disabled={acting} className="text-xs px-3 py-1.5 rounded-lg border border-white/25 text-white/80 hover:bg-white/10 disabled:opacity-50 transition">Decline</button>
                    <button onClick={() => inviteAct(inv.id, true)} disabled={acting} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:opacity-50 transition">Accept</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transfer requests where I'm the destination coach */}
      {transfers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-3 text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">Transfer requests</h2>
          <div className="space-y-2">
            {transfers.map((t) => (
              <div key={t.id} className="bg-white/20 backdrop-blur-sm rounded-xl border border-white/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t.athlete_name}</p>
                    <p className="text-xs text-white/65 mt-0.5">{t.from_coach_name} wants to transfer them to you · “{t.group_name}”</p>
                    {t.you_approved && <p className="text-[11px] text-amber-200 mt-0.5">You approved — waiting for the athlete</p>}
                  </div>
                  {!t.you_approved && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => transferAct(t.id, false)} disabled={acting} className="text-xs px-3 py-1.5 rounded-lg border border-white/25 text-white/80 hover:bg-white/10 disabled:opacity-50 transition">Decline</button>
                      <button onClick={() => transferAct(t.id, true)} disabled={acting} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:opacity-50 transition">Accept</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            className="bg-[#161616]/90 backdrop-blur-2xl border border-white/10 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 text-red-300 border border-red-400/30 flex items-center justify-center text-xl shrink-0">✕</div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-white">
                  Decline {declineTarget.athlete_name}'s request?
                </h3>
                <p className="text-sm text-white/60 mt-1">
                  They won't be added to your roster. They can send another request to you (or to a different coach) later.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeclineTarget(null)}
                disabled={acting}
                className="flex-1 py-3 rounded-xl border border-white/20 text-white/80 font-semibold hover:bg-white/10 disabled:opacity-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDecline}
                disabled={acting}
                className="flex-1 py-3 rounded-xl bg-red-500/90 text-white font-semibold hover:bg-red-500 active:scale-[0.98] disabled:opacity-50 transition"
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
