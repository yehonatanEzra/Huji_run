import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getRace, getRaceResults, getRaceLeaderboard, addHeat, addResult, updateResult, deleteResult, deleteHeat, deleteRace, updateRace } from '../../api/races';
import { searchAthletes } from '../../api/coach';
import Tabs from '../../components/ui/Tabs';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import UpcomingRaceView from './UpcomingRaceView';

const DISTANCE_LABELS = {
  1500: '1,500m', 3000: '3,000m', 5000: '5,000m',
  10000: '10,000m', 21100: 'Half Marathon', 42200: 'Marathon',
};

const DISTANCE_OPTIONS = [
  { label: '1,500m', value: 1500 },
  { label: '3,000m', value: 3000 },
  { label: '5,000m', value: 5000 },
  { label: '10,000m', value: 10000 },
  { label: 'Half Marathon (21.1km)', value: 21100 },
  { label: 'Marathon (42.2km)', value: 42200 },
];

export default function RaceDetailPage() {
  const { raceId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isCoachOrAdmin = user?.role === 'coach' || user?.role === 'admin';

  const [race, setRace] = useState(null);
  const [tab, setTab] = useState('heats');
  const [selectedDist, setSelectedDist] = useState(null);
  const [heatResults, setHeatResults] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editingResult, setEditingResult] = useState(null);
  const [editResultName, setEditResultName] = useState('');
  const [editResultTime, setEditResultTime] = useState('');
  const [editResultGender, setEditResultGender] = useState('');
  const [saving, setSaving] = useState(false);

  const [addingHeat, setAddingHeat] = useState(false);
  const [newHeatDist, setNewHeatDist] = useState(5000);
  const [newHeatLabel, setNewHeatLabel] = useState('');

  const [addingResult, setAddingResult] = useState(null);
  const [newName, setNewName] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newGender, setNewGender] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [resolvedGender, setResolvedGender] = useState(null);
  const debounceRef = useRef(null);

  const fetchRace = () => {
    getRace(raceId)
      .then(({ data }) => {
        setRace(data);
        const distances = [...new Set(data.heats.map((h) => h.distance_m))];
        if (distances.length > 0 && !selectedDist) setSelectedDist(distances[0]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRace(); }, [raceId]);

  const fetchResults = () => {
    if (!selectedDist) return;
    if (tab === 'heats') {
      getRaceResults(raceId, selectedDist)
        .then(({ data }) => setHeatResults(data))
        .catch(console.error);
    } else {
      getRaceLeaderboard(raceId, selectedDist)
        .then(({ data }) => setLeaderboard(data))
        .catch(console.error);
    }
  };

  useEffect(() => { fetchResults(); }, [raceId, selectedDist, tab]);

  const handleEditRace = async () => {
    setSaving(true);
    try {
      await updateRace(raceId, { name: editName.trim(), race_date: editDate });
      fetchRace();
      setEditing(false);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDeleteRace = async () => {
    if (!confirm('Delete this race and all its results?')) return;
    await deleteRace(raceId);
    navigate('/races');
  };

  const handleAddHeat = async () => {
    if (!newHeatLabel.trim()) return;
    setSaving(true);
    try {
      await addHeat(raceId, { distance_m: newHeatDist, label: newHeatLabel.trim() });
      setNewHeatLabel('');
      setAddingHeat(false);
      fetchRace();
      fetchResults();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDeleteHeat = async (heatId) => {
    if (!confirm('Delete this heat and all its results?')) return;
    await deleteHeat(raceId, heatId);
    fetchRace();
    fetchResults();
  };

  const openEditResult = (r, heatId) => {
    setEditingResult({ ...r, heatId });
    setEditResultName(r.athlete_name);
    const totalSec = r.time_seconds;
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    setEditResultTime(h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`);
    setEditResultGender(r.gender);
  };

  const handleUpdateResult = async () => {
    if (!editResultName.trim() || !editResultTime.trim()) return;
    setSaving(true);
    try {
      await updateResult(raceId, editingResult.heatId, editingResult.id, {
        athlete_name: editResultName.trim(),
        time_raw: editResultTime.trim(),
        gender: editResultGender,
      });
      setEditingResult(null);
      fetchResults();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDeleteResult = async (heatId, resultId) => {
    if (!confirm('Remove this runner?')) return;
    await deleteResult(raceId, heatId, resultId);
    fetchResults();
  };

  const handleNameSearch = (val) => {
    setNewName(val);
    setResolvedGender(null);
    setNewGender('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length >= 2 && isCoachOrAdmin) {
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
    setNewName(s.full_name);
    setResolvedGender(s.gender);
    setNewGender(s.gender);
    setSuggestions([]);
  };

  const handleAddResult = async (heatId) => {
    if (!newName.trim() || !newTime.trim()) return;
    const finalGender = resolvedGender || newGender;
    if (!finalGender) return;
    setSaving(true);
    try {
      await addResult(raceId, heatId, {
        athlete_name: newName.trim(),
        time_raw: newTime.trim(),
        gender: finalGender,
      });
      setNewName('');
      setNewTime('');
      setNewGender('');
      setResolvedGender(null);
      setAddingResult(null);
      fetchResults();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  if (loading) return <Spinner />;
  if (!race) return <p className="text-gray-500">Race not found</p>;

  const distances = [...new Set(race.heats.map((h) => h.distance_m))];
  // A coach can edit/delete their own race only while it's pending/rejected.
  // Admin can edit any race.
  const canEditRace = isAdmin || (
    user?.role === 'coach' &&
    (race.moderation_status === 'pending' || race.moderation_status === 'rejected') &&
    race.created_by === user?.id
  );
  // Per-result modify check used inside the heat table.
  const canModifyResult = (r) => {
    if (isAdmin) return true;
    if (!isCoachOrAdmin) return false;
    return r.created_by === user?.id && (r.moderation_status === 'pending' || r.moderation_status === 'rejected');
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-xl font-bold">{race.name}</h2>
          <p className="text-sm text-gray-500 mb-4">{race.race_date}</p>
        </div>
        {canEditRace && (
          <div className="flex gap-2">
            <button
              onClick={() => { setEditName(race.name); setEditDate(race.race_date); setEditing(true); }}
              className="text-blue-600 text-sm font-medium"
            >
              Edit
            </button>
            <button onClick={handleDeleteRace} className="text-red-600 text-sm font-medium">
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Moderation banner */}
      {race.moderation_status === 'pending' && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-4">
          <p className="text-xs text-amber-900">
            <span className="font-semibold">Pending review.</span>{' '}
            {isAdmin
              ? 'This race was proposed by a coach. Approve or reject it from the Review tab.'
              : 'Only you and admins can see this race until an admin approves it.'}
          </p>
        </div>
      )}
      {race.moderation_status === 'rejected' && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
          <p className="text-xs text-red-900">
            <span className="font-semibold">Rejected.</span> {race.decline_note || 'No note provided.'}
          </p>
        </div>
      )}

      {race.status === 'upcoming' ? (
        <>
          {canEditRace && (
            <div className="mb-3">
              {addingHeat ? (
                <div className="flex gap-2 items-center">
                  <select value={newHeatDist} onChange={(e) => setNewHeatDist(parseInt(e.target.value))}
                    className="border rounded-lg px-2 py-1.5 text-sm">
                    {DISTANCE_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <input type="text" placeholder="Heat label" value={newHeatLabel}
                    onChange={(e) => setNewHeatLabel(e.target.value)}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
                  <button onClick={handleAddHeat} disabled={saving || !newHeatLabel.trim()}
                    className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Add</button>
                  <button onClick={() => setAddingHeat(false)} className="text-gray-500 text-sm">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setAddingHeat(true)} className="text-blue-600 text-sm font-medium">+ Add Heat</button>
              )}
            </div>
          )}
          <UpcomingRaceView
            race={race}
            onResultsAdded={() => { fetchRace(); fetchResults(); }}
            refreshRace={fetchRace}
          />
        </>
      ) : (
        <>
      <Tabs
        tabs={[{ value: 'heats', label: 'Heat Results' }, { value: 'leaderboard', label: 'Leaderboard' }]}
        active={tab}
        onChange={setTab}
      />

      {distances.length > 1 && (
        <Tabs
          tabs={distances.map((d) => ({ value: d, label: DISTANCE_LABELS[d] || `${d}m` }))}
          active={selectedDist}
          onChange={setSelectedDist}
        />
      )}

      {canEditRace && tab === 'heats' && (
        <div className="mb-3">
          {addingHeat ? (
            <div className="flex gap-2 items-center">
              <select value={newHeatDist} onChange={(e) => setNewHeatDist(parseInt(e.target.value))}
                className="border rounded-lg px-2 py-1.5 text-sm">
                {DISTANCE_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <input type="text" placeholder="Heat label" value={newHeatLabel}
                onChange={(e) => setNewHeatLabel(e.target.value)}
                className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
              <button onClick={handleAddHeat} disabled={saving || !newHeatLabel.trim()}
                className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Add</button>
              <button onClick={() => setAddingHeat(false)} className="text-gray-500 text-sm">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAddingHeat(true)} className="text-blue-600 text-sm font-medium">+ Add Heat</button>
          )}
        </div>
      )}

      {tab === 'heats' ? (
        <div className="space-y-4">
          {heatResults.map((hw) => (
            <div key={hw.heat.id} className="bg-white border rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{hw.heat.label}</p>
                  <p className="text-xs text-gray-500">{DISTANCE_LABELS[hw.heat.distance_m]}</p>
                </div>
                <div className="flex gap-2">
                  {/* Add Runner: any coach or admin can propose a result */}
                  {isCoachOrAdmin && (
                    <button onClick={() => { setAddingResult(hw.heat.id); setNewName(''); setNewTime(''); setNewGender(''); setResolvedGender(null); }}
                      className="text-blue-600 text-xs font-medium">+ Runner</button>
                  )}
                  {canEditRace && (
                    <button onClick={() => handleDeleteHeat(hw.heat.id)}
                      className="text-red-500 text-xs font-medium">Delete</button>
                  )}
                </div>
              </div>

              {addingResult === hw.heat.id && (
                <div className="bg-blue-50 px-3 py-2 border-b space-y-2">
                  <div className="relative">
                    <input type="text" placeholder="Athlete name" value={newName}
                      onChange={(e) => handleNameSearch(e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                    {suggestions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg">
                        {suggestions.map((s) => (
                          <button key={s.id} onClick={() => selectSuggestion(s)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex justify-between">
                            <span>{s.full_name}</span>
                            <span className="text-xs text-gray-400">{s.gender === 'M' ? 'Male' : 'Female'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Time (MM:SS)" value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
                    {resolvedGender ? (
                      <span className="border rounded-lg px-2 py-1.5 text-sm bg-green-50 text-green-700">
                        {resolvedGender === 'M' ? 'Male' : 'Female'}
                      </span>
                    ) : (
                      <select value={newGender} onChange={(e) => setNewGender(e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm">
                        <option value="">Gender</option>
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                      </select>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleAddResult(hw.heat.id)}
                      disabled={saving || !newName.trim() || !newTime.trim() || !(resolvedGender || newGender)}
                      className="flex-1 bg-blue-600 text-white rounded-lg py-1.5 text-sm disabled:opacity-50">
                      {saving ? 'Adding...' : 'Add'}
                    </button>
                    <button onClick={() => setAddingResult(null)} className="text-gray-500 text-sm px-3">Cancel</button>
                  </div>
                </div>
              )}

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="px-3 py-1.5 text-left w-8">#</th>
                    <th className="px-3 py-1.5 text-left">Name</th>
                    <th className="px-3 py-1.5 text-right">Time</th>
                    <th className="px-3 py-1.5 text-right">Pace</th>
                    {isCoachOrAdmin && <th className="px-3 py-1.5 w-16"></th>}
                  </tr>
                </thead>
                <tbody>
                  {hw.results.map((r) => {
                    const pending = r.moderation_status === 'pending';
                    const rejected = r.moderation_status === 'rejected';
                    return (
                      <tr key={r.id} className={`border-t ${pending ? 'bg-amber-50' : rejected ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-2 font-medium">{r.placement ?? '—'}</td>
                        <td className="px-3 py-2">
                          {r.athlete_name}
                          {pending && <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 font-semibold rounded-full px-1.5 py-0.5">Pending</span>}
                          {rejected && <span className="ml-2 text-[10px] bg-red-100 text-red-800 font-semibold rounded-full px-1.5 py-0.5">Rejected</span>}
                          {rejected && r.decline_note && (
                            <p className="text-[11px] text-red-700 italic mt-0.5">"{r.decline_note}"</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{r.time_display}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{r.pace_display}</td>
                        {isCoachOrAdmin && (
                          <td className="px-3 py-2 text-right">
                            {canModifyResult(r) && (
                              <>
                                <button onClick={() => openEditResult(r, hw.heat.id)}
                                  className="text-blue-600 text-xs mr-2">Edit</button>
                                <button onClick={() => handleDeleteResult(hw.heat.id, r.id)}
                                  className="text-red-500 text-xs">X</button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : leaderboard ? (
        <div className="space-y-4">
          {[{ label: 'Men', data: leaderboard.men }, { label: 'Women', data: leaderboard.women }].map(({ label, data }) => (
            <div key={label} className="bg-white border rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b">
                <p className="text-sm font-semibold">{label}</p>
              </div>
              {data.length === 0 ? (
                <p className="text-sm text-gray-400 p-3">No results</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="px-3 py-1.5 text-left w-8">#</th>
                      <th className="px-3 py-1.5 text-left">Name</th>
                      <th className="px-3 py-1.5 text-right">Time</th>
                      <th className="px-3 py-1.5 text-right">Pace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 font-medium">{r.placement}</td>
                        <td className="px-3 py-2">{r.athlete_name}</td>
                        <td className="px-3 py-2 text-right font-mono">{r.time_display}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{r.pace_display}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      ) : <Spinner />}
        </>
      )}

      {/* Edit Race Modal */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit Race">
        <div className="space-y-3">
          <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Race name" />
          <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleEditRace} disabled={saving || !editName.trim() || !editDate}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </Modal>

      {/* Edit Result Modal */}
      <Modal open={!!editingResult} onClose={() => setEditingResult(null)} title="Edit Result">
        {editingResult && (
          <div className="space-y-3">
            <input type="text" value={editResultName} onChange={(e) => setEditResultName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Athlete name" />
            <div className="flex gap-2">
              <input type="text" value={editResultTime} onChange={(e) => setEditResultTime(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm" placeholder="Time (MM:SS)" />
              <select value={editResultGender} onChange={(e) => setEditResultGender(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm">
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
            <button onClick={handleUpdateResult} disabled={saving || !editResultName.trim() || !editResultTime.trim()}
              className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
