import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  listRegistrations, register, updateRegistration, unregister,
  addResult,
} from '../../api/races';
import { listAthletes, searchAthletes } from '../../api/coach';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

const DISTANCE_LABELS = {
  1500: '1,500m', 3000: '3,000m', 5000: '5,000m',
  10000: '10,000m', 21100: 'Half Marathon', 42200: 'Marathon',
};

function heatTitle(h) {
  return `${h.label} — ${DISTANCE_LABELS[h.distance_m] || h.distance_m + 'm'}`;
}

export default function UpcomingRaceView({ race, onResultsAdded, refreshRace }) {
  const { user } = useAuth();
  const isCoach = user?.role === 'coach' || user?.role === 'admin';

  const [regs, setRegs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHeatId, setSelectedHeatId] = useState('');
  const [savingMine, setSavingMine] = useState(false);

  // Coach: register another athlete
  const [showAddOther, setShowAddOther] = useState(false);
  const [athletes, setAthletes] = useState([]);
  const [otherUserId, setOtherUserId] = useState('');
  const [otherHeatId, setOtherHeatId] = useState('');
  const [savingOther, setSavingOther] = useState(false);

  // Add Results modal
  const [showResults, setShowResults] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listRegistrations(race.id);
      setRegs(data);
    } finally {
      setLoading(false);
    }
  }, [race.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isCoach && showAddOther) {
      listAthletes().then(({ data }) => setAthletes(data)).catch(() => {});
    }
  }, [isCoach, showAddOther]);

  // Athletes must pick a real heat — default the pickers to the first heat.
  useEffect(() => {
    if (race.heats.length) {
      setSelectedHeatId((v) => v || String(race.heats[0].id));
      setOtherHeatId((v) => v || String(race.heats[0].id));
    }
  }, [race.heats]);

  const myReg = regs.find(r => r.user_id === user.id);

  async function handleRegisterSelf() {
    setSavingMine(true);
    try {
      await register(race.id, { heat_id: selectedHeatId ? parseInt(selectedHeatId) : null });
      load();
    } finally {
      setSavingMine(false);
    }
  }

  async function handleChangeMyHeat(heatIdStr) {
    setSavingMine(true);
    try {
      await updateRegistration(race.id, user.id, { heat_id: heatIdStr ? parseInt(heatIdStr) : null });
      load();
    } finally {
      setSavingMine(false);
    }
  }

  async function handleUnregisterMe() {
    if (!confirm('Cancel your registration?')) return;
    setSavingMine(true);
    try {
      await unregister(race.id, user.id);
      load();
    } finally {
      setSavingMine(false);
    }
  }

  async function handleAddOther() {
    if (!otherUserId) return;
    setSavingOther(true);
    try {
      await register(race.id, {
        user_id: parseInt(otherUserId),
        heat_id: otherHeatId ? parseInt(otherHeatId) : null,
      });
      setOtherUserId('');
      setShowAddOther(false);
      load();
    } catch (err) {
      if (err.response?.status === 409) alert('That athlete is already registered.');
    } finally {
      setSavingOther(false);
    }
  }

  async function handleRemoveOther(userId) {
    if (!confirm('Remove this registration?')) return;
    await unregister(race.id, userId);
    load();
  }

  // Group registrations by heat (heat_id null = unassigned)
  const grouped = {};
  for (const h of race.heats) grouped[h.id] = [];
  grouped['unassigned'] = [];
  for (const r of regs) {
    const key = r.heat_id || 'unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const availableAthletes = athletes.filter(a => !regs.some(r => r.user_id === a.id));

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      {/* My registration card */}
      <div className="bg-[#161616]/70 backdrop-blur-2xl border border-white/10 rounded-2xl p-4">
        <p className="text-xs font-semibold text-white/50 mb-2">Your registration</p>
        {myReg ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-white/80">
                Registered for:{' '}
                <span className="font-semibold text-[#c0c1ff]">
                  {myReg.heat_id ? race.heats.find(h => h.id === myReg.heat_id)?.label || '—' : 'No heat selected'}
                </span>
              </p>
              <button onClick={handleUnregisterMe} disabled={savingMine} className="text-xs text-red-300 hover:text-red-200 underline">
                Cancel
              </button>
            </div>
            {race.heats.length > 0 && (
              <select
                value={myReg.heat_id || ''}
                onChange={(e) => handleChangeMyHeat(e.target.value)}
                disabled={savingMine}
                className="w-full bg-[#1c1b1c]/60 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
              >
                {race.heats.map(h => <option key={h.id} value={h.id}>{heatTitle(h)}</option>)}
              </select>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {race.heats.length > 0 && (
              <select
                value={selectedHeatId}
                onChange={(e) => setSelectedHeatId(e.target.value)}
                className="w-full bg-[#1c1b1c]/60 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
              >
                {race.heats.map(h => <option key={h.id} value={h.id}>{heatTitle(h)}</option>)}
              </select>
            )}
            <button
              onClick={handleRegisterSelf}
              disabled={savingMine}
              className="w-full bg-[#c0c1ff] text-[#1000a9] text-sm py-2 rounded-lg font-bold hover:bg-[#a9aaff] disabled:opacity-50 transition"
            >
              {savingMine ? 'Registering…' : "I'm in"}
            </button>
          </div>
        )}
      </div>

      {/* Coach actions */}
      {isCoach && (
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddOther(true)}
            className="flex-1 border border-blue-300 text-blue-700 text-sm py-2 rounded-lg font-medium hover:bg-blue-50"
          >
            + Register an athlete
          </button>
          <button
            onClick={() => setShowResults(true)}
            disabled={race.heats.length === 0}
            className="flex-1 bg-orange-500 text-white text-sm py-2 rounded-lg font-medium hover:bg-orange-600 disabled:opacity-40"
            title={race.heats.length === 0 ? 'Add at least one heat first' : ''}
          >
            + Add Results
          </button>
        </div>
      )}

      {/* Registered athletes — grouped */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-white/50">Registered athletes ({regs.length})</p>
        {race.heats.map(h => (
          <GroupSection
            key={h.id}
            title={heatTitle(h)}
            items={grouped[h.id]}
            isCoach={isCoach}
            onRemove={handleRemoveOther}
          />
        ))}
        {grouped['unassigned'].length > 0 && (
          <GroupSection
            title={race.heats.length ? 'No heat selected' : 'Registered'}
            items={grouped['unassigned']}
            isCoach={isCoach}
            onRemove={handleRemoveOther}
          />
        )}
      </div>

      {/* Coach: register others modal */}
      <Modal open={showAddOther} onClose={() => setShowAddOther(false)} title="Register an athlete">
        <div className="space-y-3">
          <select
            value={otherUserId}
            onChange={(e) => setOtherUserId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Choose athlete…</option>
            {availableAthletes.map(a => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
          <select
            value={otherHeatId}
            onChange={(e) => setOtherHeatId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {race.heats.map(h => <option key={h.id} value={h.id}>{heatTitle(h)}</option>)}
          </select>
          <button
            onClick={handleAddOther}
            disabled={savingOther || !otherUserId}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          >
            {savingOther ? 'Saving…' : 'Register'}
          </button>
        </div>
      </Modal>

      {/* Add Results modal */}
      {showResults && (
        <AddResultsModal
          race={race}
          regs={regs}
          onClose={() => setShowResults(false)}
          onSaved={() => { setShowResults(false); onResultsAdded?.(); refreshRace?.(); }}
        />
      )}
    </div>
  );
}

function GroupSection({ title, items, isCoach, onRemove }) {
  return (
    <div className="bg-[#161616]/70 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{title}</p>
        <span className="text-xs text-white/50">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-white/40 italic px-3 py-2">No one yet</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {items.map(r => (
            <li key={r.id} className="px-3 py-2 text-sm flex items-center justify-between text-white/85">
              <span>{r.athlete_name}</span>
              {isCoach && (
                <button
                  onClick={() => onRemove(r.user_id)}
                  className="text-xs text-red-300 hover:text-red-200 hover:underline"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddResultsModal({ race, regs, onClose, onSaved }) {
  // State keyed per registration user_id: { time, dns, heat_id (for unassigned) }
  const [byUser, setByUser] = useState(() => {
    const init = {};
    for (const r of regs) {
      init[r.user_id] = { time: '', dns: false, heat_id: r.heat_id };
    }
    return init;
  });

  // Ad-hoc rows per heat (non-registered athletes)
  const [adhoc, setAdhoc] = useState({}); // { [heatId]: [{ id, name, gender, time, resolvedGender }] }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setUserField(userId, field, value) {
    setByUser(prev => ({ ...prev, [userId]: { ...prev[userId], [field]: value } }));
  }

  function addAdhocRow(heatId) {
    setAdhoc(prev => ({
      ...prev,
      [heatId]: [...(prev[heatId] || []), { id: Date.now() + Math.random(), name: '', gender: '', time: '', resolvedGender: null }],
    }));
  }

  function removeAdhocRow(heatId, id) {
    setAdhoc(prev => ({
      ...prev,
      [heatId]: (prev[heatId] || []).filter(r => r.id !== id),
    }));
  }

  function setAdhocField(heatId, id, field, value) {
    setAdhoc(prev => ({
      ...prev,
      [heatId]: (prev[heatId] || []).map(r => r.id === id ? { ...r, [field]: value } : r),
    }));
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      const tasks = [];

      // Registered athletes
      for (const r of regs) {
        const st = byUser[r.user_id];
        if (!st || st.dns) continue;
        if (!st.time.trim()) continue;
        const heatId = st.heat_id || r.heat_id;
        if (!heatId) {
          setError('Some athletes have no heat assigned.');
          setSaving(false);
          return;
        }
        tasks.push(addResult(race.id, heatId, {
          athlete_name: r.athlete_name,
          time_raw: st.time.trim(),
        }));
      }

      // Ad-hoc
      for (const [heatIdStr, rows] of Object.entries(adhoc)) {
        const heatId = parseInt(heatIdStr);
        for (const row of rows) {
          if (!row.name.trim() || !row.time.trim()) continue;
          const gender = row.resolvedGender || row.gender;
          if (!gender) {
            setError('Ad-hoc entries need a gender selected.');
            setSaving(false);
            return;
          }
          tasks.push(addResult(race.id, heatId, {
            athlete_name: row.name.trim(),
            time_raw: row.time.trim(),
            gender,
          }));
        }
      }

      if (tasks.length === 0) {
        setError('Add at least one time before saving.');
        setSaving(false);
        return;
      }

      await Promise.all(tasks);
      onSaved();
    } catch (err) {
      console.error(err);
      setError('Something went wrong saving results.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Add Results — ${race.name}`}>
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        {error && <p className="text-xs text-red-600">{error}</p>}

        {race.heats.map(h => {
          const heatRegs = regs.filter(r => (r.heat_id || null) === h.id);
          const heatAdhoc = adhoc[h.id] || [];
          return (
            <div key={h.id} className="border border-gray-200 rounded-lg">
              <div className="bg-gray-50 px-3 py-2 border-b">
                <p className="text-sm font-semibold">{heatTitle(h)}</p>
              </div>
              <div className="p-3 space-y-2">
                {heatRegs.length === 0 && heatAdhoc.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No registered athletes in this heat</p>
                )}
                {heatRegs.map(r => {
                  const st = byUser[r.user_id] || { time: '', dns: false };
                  return (
                    <div key={r.user_id} className="flex items-center gap-2">
                      <span className={`flex-1 text-sm ${st.dns ? 'line-through text-gray-400' : ''}`}>{r.athlete_name}</span>
                      <input
                        type="text"
                        placeholder="MM:SS"
                        value={st.time}
                        disabled={st.dns}
                        onChange={(e) => setUserField(r.user_id, 'time', e.target.value)}
                        className="w-24 border rounded px-2 py-1 text-sm font-mono disabled:bg-gray-100"
                      />
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        <input type="checkbox" checked={st.dns} onChange={(e) => setUserField(r.user_id, 'dns', e.target.checked)} />
                        DNS
                      </label>
                    </div>
                  );
                })}

                {heatAdhoc.map(row => (
                  <AdhocRow
                    key={row.id}
                    row={row}
                    onChange={(field, val) => setAdhocField(h.id, row.id, field, val)}
                    onRemove={() => removeAdhocRow(h.id, row.id)}
                  />
                ))}

                <button
                  onClick={() => addAdhocRow(h.id)}
                  className="text-xs text-blue-600 font-medium"
                >
                  + Add result (any athlete)
                </button>
              </div>
            </div>
          );
        })}

        {/* Unassigned registrations */}
        {(() => {
          const unassigned = regs.filter(r => !r.heat_id);
          if (unassigned.length === 0) return null;
          return (
            <div className="border border-amber-200 bg-amber-50 rounded-lg">
              <div className="bg-amber-100 px-3 py-2 border-b border-amber-200">
                <p className="text-sm font-semibold text-amber-800">Unassigned registrations</p>
                <p className="text-[10px] text-amber-700">Pick a heat for each to record a time</p>
              </div>
              <div className="p-3 space-y-2">
                {unassigned.map(r => {
                  const st = byUser[r.user_id] || { time: '', dns: false, heat_id: null };
                  return (
                    <div key={r.user_id} className="flex items-center gap-2">
                      <span className={`flex-1 text-sm ${st.dns ? 'line-through text-gray-400' : ''}`}>{r.athlete_name}</span>
                      <select
                        value={st.heat_id || ''}
                        disabled={st.dns}
                        onChange={(e) => setUserField(r.user_id, 'heat_id', e.target.value ? parseInt(e.target.value) : null)}
                        className="border rounded px-2 py-1 text-xs disabled:bg-gray-100"
                      >
                        <option value="">heat…</option>
                        {race.heats.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
                      </select>
                      <input
                        type="text"
                        placeholder="MM:SS"
                        value={st.time}
                        disabled={st.dns}
                        onChange={(e) => setUserField(r.user_id, 'time', e.target.value)}
                        className="w-20 border rounded px-2 py-1 text-sm font-mono disabled:bg-gray-100"
                      />
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        <input type="checkbox" checked={st.dns} onChange={(e) => setUserField(r.user_id, 'dns', e.target.checked)} />
                        DNS
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      <div className="flex gap-2 mt-4 pt-3 border-t">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-orange-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Results'}
        </button>
        <button onClick={onClose} className="px-4 border rounded-lg text-sm">Cancel</button>
      </div>
    </Modal>
  );
}

function AdhocRow({ row, onChange, onRemove }) {
  const debounceRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);

  function handleNameInput(val) {
    onChange('name', val);
    onChange('resolvedGender', null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length >= 2) {
      debounceRef.current = setTimeout(async () => {
        try {
          const { data } = await searchAthletes(val);
          setSuggestions(data);
        } catch {}
      }, 300);
    } else {
      setSuggestions([]);
    }
  }

  function pickSuggestion(s) {
    onChange('name', s.full_name);
    onChange('resolvedGender', s.gender);
    onChange('gender', s.gender);
    setSuggestions([]);
  }

  return (
    <div className="border-t pt-2 first:border-t-0 first:pt-0 space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Name"
            value={row.name}
            onChange={(e) => handleNameInput(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
          {suggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-32 overflow-auto">
              {suggestions.map(s => (
                <button
                  key={s.id}
                  onClick={() => pickSuggestion(s)}
                  className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 flex justify-between"
                >
                  <span>{s.full_name}</span>
                  <span className="text-gray-400">{s.gender === 'M' ? 'M' : 'F'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="text"
          placeholder="MM:SS"
          value={row.time}
          onChange={(e) => onChange('time', e.target.value)}
          className="w-20 border rounded px-2 py-1 text-sm font-mono"
        />
        {row.resolvedGender ? (
          <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-1">{row.resolvedGender}</span>
        ) : (
          <select
            value={row.gender}
            onChange={(e) => onChange('gender', e.target.value)}
            className="border rounded px-1 py-1 text-xs"
          >
            <option value="">?</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        )}
        <button onClick={onRemove} className="text-red-500 text-xs">×</button>
      </div>
    </div>
  );
}
