import { useState, useEffect } from 'react';
import { listAthletes } from '../../api/coach';
import { removeAthleteFromRoster } from '../../api/coaching';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';

const GLASS = 'bg-[#161616]/85 backdrop-blur-2xl border border-white/10';

export default function SettingsPage() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [acting, setActing] = useState(false);

  const fetch = () => {
    setLoading(true);
    listAthletes()
      .then(({ data }) => setAthletes(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const handleRemoveFromRoster = async () => {
    setActing(true);
    try {
      await removeAthleteFromRoster(removeTarget.id);
      setRemoveTarget(null);
      fetch();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not remove');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="relative pb-8">
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />

      <h2 className="text-xl font-bold mb-1 text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">My athletes</h2>
      <p className="text-xs text-white/55 mb-4">
        Every athlete you coach — in a group or not. Removing one keeps their past data but
        clears their future workouts; they can register with another coach (or you) again.
      </p>

      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {athletes.map((a) => (
            <div key={a.id} className={`${GLASS} flex items-center gap-2 p-3 rounded-xl`}>
              <div className="w-9 h-9 rounded-full bg-[#8083ff]/25 border border-[#8083ff]/30 flex items-center justify-center font-bold text-[#c0c1ff] shrink-0">
                {(a.full_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{a.full_name}</p>
                <p className="text-[11px] text-white/40">{a.gender === 'M' ? 'Male' : 'Female'}</p>
              </div>
              <button
                onClick={() => setRemoveTarget(a)}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-400/40 text-red-300 hover:bg-red-400/15 transition"
              >Remove</button>
            </div>
          ))}
          {athletes.length === 0 && (
            <p className="text-sm text-white/45 text-center py-8">
              No athletes registered with you yet. Athletes request to join from the Find Coach page.
            </p>
          )}
        </div>
      )}

      <Modal open={!!removeTarget} onClose={() => setRemoveTarget(null)} panelClassName="bg-[#131314] border-t border-white/10">
        {removeTarget && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-white">Remove {removeTarget.full_name}?</h3>
            <p className="text-sm text-white/60">
              Stops coaching them. Past data stays, but their future workouts are cleared and they
              leave their group. They can register with another coach (or yours again) afterwards.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setRemoveTarget(null)}
                disabled={acting}
                className="flex-1 border border-white/20 rounded-xl py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50 transition"
              >Cancel</button>
              <button
                onClick={handleRemoveFromRoster}
                disabled={acting}
                className="flex-1 bg-red-500/90 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-500 disabled:opacity-50 transition"
              >{acting ? 'Removing…' : 'Remove'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
