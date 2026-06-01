import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { syncStrava } from '../api/strava';

export default function StravaSyncIconButton() {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState(false);

  if (!user?.strava_connected) return null;

  const handleSync = async () => {
    setSyncing(true);
    setMsg('');
    setError(false);
    try {
      const { data } = await syncStrava(14);
      const parts = [];
      if (data.created > 0) parts.push(`${data.created} new`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      setMsg(parts.length ? `✓ ${parts.join(', ')}` : '✓ Up to date');
      // Notify any listening pages so they can refresh their data.
      window.dispatchEvent(new CustomEvent('strava-synced'));
    } catch (err) {
      setMsg(err?.response?.data?.detail || 'Sync failed');
      setError(true);
    } finally {
      setSyncing(false);
      setTimeout(() => setMsg(''), 3500);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleSync}
        disabled={syncing}
        title="Sync with Strava"
        aria-label="Sync with Strava"
        className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-full px-3 py-1 transition disabled:opacity-60 shadow-md"
      >
        <span className={`inline-block ${syncing ? 'animate-spin' : ''}`}>↻</span>
        <span>{syncing ? 'Syncing' : 'Sync'}</span>
      </button>
      {msg && (
        <div
          className={`absolute right-0 top-full mt-2 px-2.5 py-1.5 backdrop-blur-md border rounded-lg shadow-xl text-xs whitespace-nowrap z-50 ${
            error
              ? 'bg-red-900/95 border-red-400/30 text-red-100'
              : 'bg-blue-950/95 border-white/20 text-white'
          }`}
        >
          {msg}
        </div>
      )}
    </div>
  );
}
