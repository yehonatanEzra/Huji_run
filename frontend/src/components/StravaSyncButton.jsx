import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { syncStrava } from '../api/strava';

export default function StravaSyncButton({ onSynced, className = '' }) {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');

  if (!user?.strava_connected) return null;

  const handleSync = async () => {
    setSyncing(true);
    setMsg('');
    try {
      const { data } = await syncStrava(14);
      const parts = [];
      if (data.created > 0) parts.push(`${data.created} new`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      const summary = parts.length
        ? `✓ Synced ${data.days_with_activity} day${data.days_with_activity === 1 ? '' : 's'} from Strava (${parts.join(', ')})`
        : '✓ Already up to date';
      setMsg(summary);
      if (onSynced) onSynced();
    } catch (err) {
      setMsg(err?.response?.data?.detail || 'Could not sync');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={className}>
      <button
        onClick={handleSync}
        disabled={syncing}
        className="w-full bg-orange-500/90 hover:bg-orange-500 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50 shadow-lg [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]"
      >
        {syncing ? 'Syncing…' : '🔄 Sync with Strava'}
      </button>
      {msg && (
        <p className={`text-xs mt-2 text-center ${msg.startsWith('✓') ? 'text-green-300' : 'text-red-300'} [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]`}>
          {msg}
        </p>
      )}
    </div>
  );
}
