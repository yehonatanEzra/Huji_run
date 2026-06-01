import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { syncStrava, getStravaConnectUrl } from '../api/strava';

export default function StravaSyncIconButton() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState(false);

  if (!user) return null;
  // Only athletes log workouts; coaches and admins don't need to connect/sync Strava.
  if (user.role !== 'athlete') return null;
  const connected = !!user.strava_connected;

  const handleSync = async () => {
    setBusy(true);
    setMsg('');
    setError(false);
    try {
      const { data } = await syncStrava(14);
      const parts = [];
      if (data.created > 0) parts.push(`${data.created} new`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      setMsg(parts.length ? `✓ ${parts.join(', ')}` : '✓ Up to date');
      window.dispatchEvent(new CustomEvent('strava-synced'));
    } catch (err) {
      setMsg(err?.response?.data?.detail || 'Sync failed');
      setError(true);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(''), 3500);
    }
  };

  const handleConnect = async () => {
    setBusy(true);
    setMsg('');
    setError(false);
    try {
      const { data } = await getStravaConnectUrl();
      window.location.href = data.url;
    } catch (err) {
      setMsg(err?.response?.data?.detail || 'Could not connect');
      setError(true);
      setBusy(false);
      setTimeout(() => setMsg(''), 3500);
    }
  };

  const onClick = connected ? handleSync : handleConnect;
  const label = connected
    ? (busy ? 'Syncing' : 'Sync')
    : (busy ? 'Redirecting' : 'Connect');
  const spin = connected && busy;
  const title = connected ? 'Sync with Strava' : 'Connect your Strava account';

  return (
    <div className="relative">
      <button
        onClick={onClick}
        disabled={busy}
        title={title}
        aria-label={title}
        className="flex items-center gap-1 bg-orange-500 hover:bg-orange-400 text-white text-[10px] font-semibold rounded-full px-2 py-0.5 transition disabled:opacity-60 shadow-md"
      >
        {connected && <span className={`inline-block ${spin ? 'animate-spin' : ''}`}>↻</span>}
        <span>{label}</span>
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
