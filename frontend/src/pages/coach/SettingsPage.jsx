import { useState, useEffect } from 'react';
import { listAthletes } from '../../api/coach';
import { removeAthleteFromRoster } from '../../api/coaching';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';

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
      const msg = err?.response?.data?.detail || 'Could not remove';
      alert(msg);
    } finally {
      setActing(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Settings</h2>
      <p className="text-xs text-gray-500 mb-4">
        Remove athletes from your roster. Their data stays intact and they can re-pair later.
      </p>
      <h3 className="text-base font-semibold mb-3">My athletes ({athletes.length})</h3>

      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {athletes.map((a) => (
            <div key={a.id} className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 bg-white">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{a.full_name}</p>
                <p className="text-xs text-gray-400">{a.gender === 'M' ? 'Male' : 'Female'}</p>
              </div>
              <button
                onClick={() => setRemoveTarget(a)}
                className="text-sm text-orange-600 hover:underline"
              >Remove</button>
            </div>
          ))}
          {athletes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
              No athletes registered with you yet. Athletes will request to join from the Find Coach page.
            </p>
          )}
        </div>
      )}

      <Modal open={!!removeTarget} onClose={() => setRemoveTarget(null)} title="Remove from roster">
        {removeTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Remove <strong>{removeTarget.full_name}</strong> from your roster?
              Their data stays intact and they can register with another coach (or yours again).
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRemoveFromRoster}
                disabled={acting}
                className="flex-1 bg-orange-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
              >{acting ? 'Removing…' : 'Remove'}</button>
              <button
                onClick={() => setRemoveTarget(null)}
                className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
