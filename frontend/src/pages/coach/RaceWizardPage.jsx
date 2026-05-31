import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRace, addHeat, addResult } from '../../api/races';
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
      const { data } = await createRace({ name: raceName.trim(), race_date: raceDate });
      setRaceId(data.id);
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
      <h2 className="text-xl font-bold mb-2">Create Race</h2>
      {isCoachOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-xs text-amber-900">
            <span className="font-semibold">Pending admin approval.</span>{' '}
            This race will be visible only to you and an admin until an admin approves it.
          </p>
        </div>
      )}
      <div className="flex gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`flex-1 h-1.5 rounded-full ${step >= s ? 'bg-blue-600' : 'bg-gray-200'}`} />
        ))}
      </div>

      {error && <p className="text-red-500 text-sm bg-red-50 rounded p-2 mb-4">{error}</p>}

      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold">Step 1: Race Info</h3>
          <input
            type="text"
            placeholder="Race Name"
            value={raceName}
            onChange={(e) => setRaceName(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="date"
            value={raceDate}
            onChange={(e) => setRaceDate(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleStep1}
            disabled={saving || !raceName.trim() || !raceDate}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Next'}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold">Step 2: Add Heats</h3>
          <div className="flex gap-2">
            <select
              value={newDist}
              onChange={(e) => setNewDist(parseInt(e.target.value))}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={handleAddHeat} disabled={saving || !newLabel.trim()} className="bg-blue-600 text-white rounded-lg px-4 text-sm disabled:opacity-50">
              Add
            </button>
          </div>

          {heats.length > 0 && (
            <div className="space-y-1">
              {heats.map((h, i) => (
                <div key={h.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <span className="font-medium">{DISTANCE_OPTIONS.find((d) => d.value === h.distance_m)?.label}</span>
                  <span className="text-gray-500">- {h.label}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => { setActiveHeat(0); setStep(3); }}
            disabled={heats.length === 0}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Next: Enter Results
          </button>
        </div>
      )}

      {step === 3 && (
        <Step3
          raceId={raceId}
          heats={heats}
          setHeats={setHeats}
          activeHeat={activeHeat}
          setActiveHeat={setActiveHeat}
          onDone={() => navigate(`/races/${raceId}`)}
        />
      )}
    </div>
  );
}

function Step3({ raceId, heats, setHeats, activeHeat, setActiveHeat, onDone }) {
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
      <h3 className="text-base font-semibold">Step 3: Enter Results</h3>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {heats.map((h, i) => (
          <button
            key={h.id}
            onClick={() => setActiveHeat(i)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              i === activeHeat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {h.label} ({h.results.length})
          </button>
        ))}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Athlete name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {suggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between"
                >
                  <span>{s.full_name}</span>
                  <span className="text-xs text-gray-400">{s.gender === 'M' ? 'Male' : 'Female'}</span>
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
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {resolvedGender ? (
            <span className="border rounded-lg px-3 py-2 text-sm bg-green-50 text-green-700">
              {resolvedGender === 'M' ? 'Male' : 'Female'}
            </span>
          ) : (
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Adding...' : 'Add Result'}
        </button>
      </div>

      {heat.results.length > 0 && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-500">
                <th className="px-3 py-1.5 text-left">#</th>
                <th className="px-3 py-1.5 text-left">Name</th>
                <th className="px-3 py-1.5 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {[...heat.results].sort((a, b) => a.time_seconds - b.time_seconds).map((r, i) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">{r.athlete_name}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.time_display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={onDone}
        className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700"
      >
        Finish Race
      </button>
    </div>
  );
}
