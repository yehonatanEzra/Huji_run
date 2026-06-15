import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { listGoals, createGoal, deleteGoal } from '../../api/goals';
import { listRaces } from '../../api/races';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';

// Mirrors backend CANONICAL_DISTANCES (models/race.py).
const DISTANCES = [
  { value: 1500, label: '1,500m' },
  { value: 3000, label: '3,000m' },
  { value: 5000, label: '5,000m' },
  { value: 10000, label: '10,000m' },
  { value: 21100, label: 'Half Marathon' },
  { value: 42200, label: 'Marathon' },
];
const distLabel = (m) => DISTANCES.find((d) => d.value === m)?.label || `${m}m`;

const GLASS = 'bg-[#161616]/70 backdrop-blur-2xl border border-white/10';
const INPUT = 'w-full bg-[#1c1b1c]/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20';

export default function GoalsPanel({ athleteId, canEdit = false }) {
  const [goals, setGoals] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    if (!athleteId) return;
    listGoals(athleteId)
      .then(({ data }) => setGoals(data))
      .catch(() => setGoals([]));
  }, [athleteId]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    try { await deleteGoal(id); load(); } catch (err) { console.error(err); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-white">Goals</h3>
        {canEdit && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs font-semibold bg-[#c0c1ff] text-[#1000a9] rounded-full px-3 py-1 hover:bg-[#a9aaff] active:scale-95 transition"
          >
            + Add goal
          </button>
        )}
      </div>

      {goals === null ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : goals.length === 0 ? (
        <p className={`${GLASS} rounded-2xl px-4 py-5 text-sm text-white/45 text-center`}>
          No goals yet.{canEdit ? ' Tap “Add goal” to set one.' : ''}
        </p>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} canEdit={canEdit} onDelete={() => handleDelete(g.id)} />
          ))}
        </div>
      )}

      {adding && (
        <GoalFormModal
          athleteId={athleteId}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load(); }}
        />
      )}
    </div>
  );
}

function GoalCard({ goal, canEdit, onDelete }) {
  const title = goal.goal_type === 'volume' ? 'Weekly volume'
    : goal.goal_type === 'race' ? (goal.race_name || 'Race')
    : `${distLabel(goal.distance_m)} PB`;
  const subline = goal.goal_type === 'race'
    ? `${goal.race_date ? format(new Date(goal.race_date + 'T00:00'), 'MMM d') : ''} · ${distLabel(goal.distance_m)}`
    : (goal.note || '');
  const bottom = goal.goal_type === 'volume'
    ? `${goal.current_display} this week`
    : goal.goal_type === 'race'
      ? (goal.current_display === '—' ? 'Awaiting result' : `Result ${goal.current_display}`)
      : `Best ${goal.current_display}`;
  const pct = Math.max(0, Math.min(100, goal.progress_pct || 0));
  const barColor = goal.achieved ? 'bg-green-400' : 'bg-[#c0c1ff]';
  return (
    <div className={`${GLASS} rounded-2xl px-4 py-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {title}
            {goal.achieved && <span className="ml-2 text-[10px] font-bold text-green-300 align-middle">✓ Achieved</span>}
          </p>
          {subline.trim() && <p className="text-[11px] text-white/45 truncate">{subline}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-[#c0c1ff]">{goal.target_display}</span>
          {canEdit && (
            <button onClick={onDelete} aria-label="Delete goal"
              className="text-[11px] text-red-300/70 hover:text-red-300 transition">✕</button>
          )}
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-white/50">{bottom}{' · '}{Math.round(pct)}%</p>
    </div>
  );
}

function GoalFormModal({ athleteId, onClose, onSaved }) {
  const [type, setType] = useState('volume');
  const [km, setKm] = useState('');
  const [distance, setDistance] = useState(5000);
  const [min, setMin] = useState('');
  const [sec, setSec] = useState('');
  const [note, setNote] = useState('');
  const [races, setRaces] = useState([]);
  const [raceId, setRaceId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listRaces({ status: 'upcoming' })
      .then(({ data }) => {
        setRaces(data || []);
        if ((data || []).length) setRaceId(String(data[0].id));
      })
      .catch(() => setRaces([]));
  }, []);

  const timeSecs = (parseInt(min || 0) * 60 + parseInt(sec || 0));
  const valid = type === 'volume' ? parseFloat(km) > 0
    : type === 'race' ? (!!raceId && timeSecs > 0)
    : timeSecs > 0;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const body = { athlete_id: athleteId, goal_type: type, note: note.trim() || null };
      if (type === 'volume') {
        body.target_km = parseFloat(km);
      } else {
        body.distance_m = distance;
        body.target_seconds = timeSecs;
        if (type === 'race') body.race_id = Number(raceId);
      }
      await createGoal(body);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save goal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New goal" panelClassName="bg-[#131314] border-t border-white/10">
      <div className="space-y-3">
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          {[['volume', 'Volume'], ['pb', 'PB'], ['race', 'Race']].map(([k, label]) => (
            <button key={k} onClick={() => setType(k)}
              className={`flex-1 py-1.5 text-sm font-medium transition ${type === k ? 'bg-[#c0c1ff] text-[#1000a9]' : 'bg-black/40 text-white/70 hover:bg-black/30'}`}>
              {label}
            </button>
          ))}
        </div>

        {type === 'volume' ? (
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1">Target km per week</label>
            <input type="number" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)}
              placeholder="e.g. 40" className={INPUT} />
          </div>
        ) : (
          <>
            {type === 'race' && (
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1">Race</label>
                {races.length === 0 ? (
                  <p className="text-xs text-white/45 italic">No upcoming races to target.</p>
                ) : (
                  <select value={raceId} onChange={(e) => setRaceId(e.target.value)} className={INPUT}>
                    {races.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} · {r.race_date}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Distance</label>
              <select value={distance} onChange={(e) => setDistance(parseInt(e.target.value))} className={INPUT}>
                {DISTANCES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Target time</label>
              <div className="flex items-center gap-2">
                <input type="number" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)}
                  placeholder="min" className={INPUT} />
                <span className="text-white/40">:</span>
                <input type="number" inputMode="numeric" value={sec} onChange={(e) => setSec(e.target.value)}
                  placeholder="sec" className={INPUT} />
              </div>
            </div>
          </>
        )}

        <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)" className={INPUT} />

        {error && <p className="text-red-300 text-sm bg-red-500/15 border border-red-400/30 rounded p-2">{error}</p>}

        <button onClick={handleSave} disabled={saving || !valid}
          className="w-full bg-[#c0c1ff] text-[#1000a9] rounded-lg py-2.5 text-sm font-bold hover:bg-[#a9aaff] disabled:opacity-50 transition">
          {saving ? 'Saving…' : 'Set goal'}
        </button>
      </div>
    </Modal>
  );
}
