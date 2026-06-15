import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRace, updateRace, addHeat, addResult } from '../../api/races';
import { searchAthletes } from '../../api/coach';
import { useAuth } from '../../contexts/AuthContext';

const DISTANCE_OPTIONS = [
  { label: '1,500m', value: 1500 },
  { label: '3,000m', value: 3000 },
  { label: '5,000m', value: 5000 },
  { label: '10,000m', value: 10000 },
  { label: 'Half Marathon (21.1km)', value: 21100 },
  { label: 'Marathon (42.2km)', value: 42200 },
];

export default function RaceWizardPage() {
  const [step, setStep] = useState(1);
  const [raceId, setRaceId] = useState(null);
  const [raceName, setRaceName] = useState('');
  const [raceDate, setRaceDate] = useState('');
  const [raceScope, setRaceScope] = useState('global');
  const [heats, setHeats] = useState([]);
  const [newDist, setNewDist] = useState(5000);
  const [newLabel, setNewLabel] = useState('');
  const [activeHeat, setActiveHeat] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isCoachOnly = user?.role === 'coach';

  const handleStep1 = async () => {
    if (!raceName.trim() || !raceDate) return;
    setSaving(true);
    setError('');
    try {
      if (raceId) {
        // Coming back to edit — update the already-created race instead of duplicating it.
        await updateRace(raceId, { name: raceName.trim(), race_date: raceDate, scope: raceScope });
      } else {
        const { data } = await createRace({ name: raceName.trim(), race_date: raceDate, scope: raceScope });
        setRaceId(data.id);
      }
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create race');
    } finally {
      setSaving(false);
    }
  };

  const handleAddHeat = async () => {
    if (!newLabel.trim()) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await addHeat(raceId, { distance_m: newDist, label: newLabel.trim() });
      setHeats([...heats, { ...data, results: [] }]);
      setNewLabel('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add heat');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />
      <h2 className="text-xl font-bold mb-2 text-white">Create Race</h2>
      {isCoachOnly && (
        <div className="bg-amber-500/15 border border-amber-400/30 rounded-lg p-3 mb-4">
          <p className="text-xs text-amber-100">
            <span className="font-semibold">Pending admin approval.</span>{' '}
            This race will be visible only to you and an admin until an admin approves it.
          </p>
        </div>
      )}
      <div className="flex gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`flex-1 h-1.5 rounded-full ${step >= s ? 'bg-[#c0c1ff]' : 'bg-white/15'}`} />
        ))}
      </div>

      {error && <p className="text-red-300 text-sm bg-red-500/15 border border-red-400/30 rounded p-2 mb-4">{error}</p>}

      <div className="bg-[#161616]/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-4">
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-white">Step 1: Race Info</h3>
          <input
            type="text"
            placeholder="Race Name"
            value={raceName}
            onChange={(e) => setRaceName(e.target.value)}
            className="w-full bg-[#1c1b1c]/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
          />
          <input
            type="date"
            value={raceDate}
            onChange={(e) => setRaceDate(e.target.value)}
            className="w-full bg-[#1c1b1c]/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
          />
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1">Visibility</label>
            <div className="flex gap-2">
              {[
                { value: 'global', label: 'Global', desc: 'Everyone & Hall of Fame' },
                { value: 'group', label: 'Group', desc: 'Training group members' },
                { value: 'personal', label: 'Personal', desc: 'Athletes & coaches only' },
              ].map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRaceScope(value)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-center transition-colors ${
                    raceScope === value
                      ? 'border-[#c0c1ff]/50 bg-[#c0c1ff]/10 text-[#c0c1ff]'
                      : 'border-white/10 text-white/60 hover:border-white/25'
                  }`}
                >
                  <div className="text-xs font-semibold">{label}</div>
                  <div className="text-[10px] leading-tight mt-0.5 opacity-75">{desc}</div>
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleStep1}
            disabled={saving || !raceName.trim() || !raceDate}
            className="w-full bg-[#c0c1ff] text-[#1000a9] rounded-lg py-2.5 text-sm font-medium hover:bg-[#a9aaff] disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Next'}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-white">Step 2: Add Heats</h3>
          <div className="flex gap-2">
            <select
              value={newDist}
              onChange={(e) => setNewDist(parseInt(e.target.value))}
              className="flex-1 bg-[#1c1b1c]/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
            >
              {DISTANCE_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Heat label (e.g. Elite)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="flex-1 bg-[#1c1b1c]/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
            />
            <button onClick={handleAddHeat} disabled={saving || !newLabel.trim()} className="bg-[#c0c1ff] text-[#1000a9] rounded-lg px-4 text-sm disabled:opacity-50">
              Add
            </button>
          </div>

          {heats.length > 0 && (
            <div className="space-y-1">
              {heats.map((h, i) => (
                <div key={h.id} className="flex items-center gap-2 bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/85">
                  <span className="font-medium text-white">{DISTANCE_OPTIONS.find((d) => d.value === h.distance_m)?.label}</span>
                  <span className="text-white/50">- {h.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="px-4 border border-white/20 text-white/80 rounded-lg py-2.5 text-sm font-medium hover:bg-white/10 transition"
            >
              ‹ Back
            </button>
            <button
              onClick={() => { setActiveHeat(0); setStep(3); }}
              disabled={heats.length === 0}
              className="flex-1 bg-[#c0c1ff] text-[#1000a9] rounded-lg py-2.5 text-sm font-medium hover:bg-[#a9aaff] disabled:opacity-50"
            >
              Next: Enter Results
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <Step3
          raceId={raceId}
          heats={heats}
          setHeats={setHeats}
          activeHeat={activeHeat}
          setActiveHeat={setActiveHeat}
          onBack={() => setStep(2)}
          onDone={() => navigate(`/races/${raceId}`)}
        />
      )}
      </div>
    </div>
  );
}

function Step3({ raceId, heats, setHeats, activeHeat, setActiveHeat, onBack, onDone }) {
  const heat = heats[activeHeat];
  const [name, setName] = useState('');
  const [timeRaw, setTimeRaw] = useState('');
  const [gender, setGender] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [resolvedGender, setResolvedGender] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  const handleNameChange = (val) => {
    setName(val);
    setResolvedGender(null);
    setGender('');
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
  };

  const selectSuggestion = (s) => {
    setName(s.full_name);
    setResolvedGender(s.gender);
    setGender(s.gender);
    setSuggestions([]);
  };

  const handleAdd = async () => {
    if (!name.trim() || !timeRaw.trim()) return;
    const finalGender = resolvedGender || gender;
    if (!finalGender) { setError('Select gender'); return; }
    setSaving(true);
    setError('');
    try {
      const { data } = await addResult(raceId, heat.id, {
        athlete_name: name.trim(),
        time_raw: timeRaw.trim(),
        gender: finalGender,
      });
      const updated = [...heats];
      updated[activeHeat] = { ...heat, results: [...heat.results, data] };
      setHeats(updated);
      setName('');
      setTimeRaw('');
      setGender('');
      setResolvedGender(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add result');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-white">Step 3: Enter Results</h3>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {heats.map((h, i) => (
          <button
            key={h.id}
            onClick={() => setActiveHeat(i)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              i === activeHeat ? 'bg-[#c0c1ff] text-[#1000a9]' : 'bg-white/10 text-white/70'
            }`}
          >
            {h.label} ({h.results.length})
          </button>
        ))}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="bg-white/5 rounded-xl p-3 space-y-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Athlete name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full bg-[#1c1b1c]/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
          />
          {suggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-[#1c1b1c] border border-white/10 rounded-lg shadow-2xl">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 flex items-center justify-between"
                >
                  <span>{s.full_name}</span>
                  <span className="text-xs text-white/40">{s.gender === 'M' ? 'Male' : 'Female'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Time (MM:SS or H:MM:SS)"
            value={timeRaw}
            onChange={(e) => setTimeRaw(e.target.value)}
            className="flex-1 bg-[#1c1b1c]/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
          />
          {resolvedGender ? (
            <span className="border border-emerald-400/30 rounded-lg px-3 py-2 text-sm bg-emerald-500/15 text-emerald-300">
              {resolvedGender === 'M' ? 'Male' : 'Female'}
            </span>
          ) : (
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="bg-[#1c1b1c]/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
            >
              <option value="">Gender</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          )}
        </div>

        <button
          onClick={handleAdd}
          disabled={saving || !name.trim() || !timeRaw.trim()}
          className="w-full bg-[#c0c1ff] text-[#1000a9] rounded-lg py-2 text-sm font-medium hover:bg-[#a9aaff] disabled:opacity-50"
        >
          {saving ? 'Adding...' : 'Add Result'}
        </button>
      </div>

      {heat.results.length > 0 && (
        <div className="bg-[#161616]/70 backdrop-blur-2xl border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-white/90">
            <thead>
              <tr className="bg-white/5 border-b border-white/10 text-white/50">
                <th className="px-3 py-1.5 text-left">#</th>
                <th className="px-3 py-1.5 text-left">Name</th>
                <th className="px-3 py-1.5 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {[...heat.results].sort((a, b) => a.time_seconds - b.time_seconds).map((r, i) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">{r.athlete_name}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.time_display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="px-4 border border-white/20 text-white/80 rounded-lg py-2.5 text-sm font-medium hover:bg-white/10 transition"
        >
          ‹ Back
        </button>
        <button
          onClick={onDone}
          className="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700"
        >
          Finish Race
        </button>
      </div>
    </div>
  );
}
