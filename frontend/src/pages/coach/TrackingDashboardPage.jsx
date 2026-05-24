import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, subWeeks, addWeeks, startOfMonth, endOfMonth, subMonths, addMonths, isSameMonth } from 'date-fns';
import { getDashboardWeek, getAthleteProfile, getAthleteWeek, addAthletePB } from '../../api/coach';
import { listRaces, getRace } from '../../api/races';
import { upsertTarget, deleteTarget } from '../../api/calendar';
import { toggleKudos } from '../../api/kudos';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

export default function TrackingDashboardPage() {
  const [weekDate, setWeekDate] = useState(new Date());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [personalNote, setPersonalNote] = useState('');
  const [overrideGroup, setOverrideGroup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileWeekDate, setProfileWeekDate] = useState(new Date());
  const [profileWeek, setProfileWeek] = useState(null);
  const [profileViewMode, setProfileViewMode] = useState('week');
  const [profileMonthDate, setProfileMonthDate] = useState(new Date());
  const [profileMonth, setProfileMonth] = useState(null);
  const [showPBForm, setShowPBForm] = useState(false);
  const [pbMode, setPbMode] = useState('manual');
  const [pbForm, setPbForm] = useState({ distance_m: '', time_min: '', time_sec: '', competition_name: '' });
  const [pbRaces, setPbRaces] = useState([]);
  const [pbSelectedRace, setPbSelectedRace] = useState(null);
  const [pbHeats, setPbHeats] = useState([]);
  const [pbSelectedHeat, setPbSelectedHeat] = useState(null);
  const [pbSaving, setPbSaving] = useState(false);

  const fetchData = () => {
    setLoading(true);
    getDashboardWeek(format(weekDate, 'yyyy-MM-dd'))
      .then(({ data }) => setData(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [weekDate]);

  const openCell = (athlete, dayData) => {
    setSelected({ athlete, day: dayData });
    setPersonalNote(dayData.target?.note || '');
    setOverrideGroup(dayData.target?.override_group || false);
  };

  const handleSavePersonal = async () => {
    setSaving(true);
    try {
      if (personalNote.trim()) {
        await upsertTarget(selected.athlete.id, selected.day.date, personalNote, overrideGroup);
      } else {
        await deleteTarget(selected.athlete.id, selected.day.date);
      }
      setSelected(null);
      fetchData();
      if (profile && profile.id === selected.athlete.id) {
        const { data } = await getAthleteWeek(profile.id, format(profileWeekDate, 'yyyy-MM-dd'));
        setProfileWeek(data);
        if (profileViewMode === 'month') {
          const m = await fetchProfileMonth(profile.id, profileMonthDate);
          setProfileMonth(m);
        }
      }
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const openProfile = (athleteId) => {
    setProfileLoading(true);
    setProfile(null);
    setProfileWeek(null);
    setProfileWeekDate(new Date());
    getAthleteProfile(athleteId)
      .then(({ data }) => {
        setProfile(data);
        return getAthleteWeek(athleteId, format(new Date(), 'yyyy-MM-dd'));
      })
      .then(({ data }) => setProfileWeek(data))
      .catch(console.error)
      .finally(() => setProfileLoading(false));
  };

  useEffect(() => {
    if (!profile) return;
    getAthleteWeek(profile.id, format(profileWeekDate, 'yyyy-MM-dd'))
      .then(({ data }) => setProfileWeek(data))
      .catch(console.error);
  }, [profileWeekDate]);

  const fetchProfileMonth = async (athleteId, monthDate) => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    let cursor = startOfWeek(monthStart, { weekStartsOn: 0 });
    const promises = [];
    while (cursor <= monthEnd) {
      promises.push(getAthleteWeek(athleteId, format(cursor, 'yyyy-MM-dd')));
      cursor = addWeeks(cursor, 1);
    }
    const results = await Promise.all(promises);
    const weeks = results.map(r => r.data.days);
    return { weeks };
  };

  useEffect(() => {
    if (!profile || profileViewMode !== 'month') return;
    setProfileMonth(null);
    fetchProfileMonth(profile.id, profileMonthDate)
      .then(setProfileMonth)
      .catch(console.error);
  }, [profile?.id, profileMonthDate, profileViewMode]);

  const openPBForm = () => {
    setShowPBForm(true);
    setPbMode('manual');
    setPbForm({ distance_m: '', time_min: '', time_sec: '', competition_name: '' });
    setPbSelectedRace(null);
    setPbHeats([]);
    setPbSelectedHeat(null);
    listRaces().then(({ data }) => setPbRaces(data)).catch(console.error);
  };

  const handleSelectRace = async (raceId) => {
    if (!raceId) { setPbSelectedRace(null); setPbHeats([]); setPbSelectedHeat(null); return; }
    try {
      const { data } = await getRace(raceId);
      setPbSelectedRace(data);
      setPbHeats(data.heats || []);
      setPbSelectedHeat(null);
    } catch (err) { console.error(err); }
  };

  const handleSavePB = async () => {
    const timeSeconds = (parseInt(pbForm.time_min) || 0) * 60 + (parseInt(pbForm.time_sec) || 0);
    if (timeSeconds <= 0) return;

    setPbSaving(true);
    try {
      const payload = { athlete_id: profile.id, time_seconds: timeSeconds };
      if (pbMode === 'race' && pbSelectedRace && pbSelectedHeat) {
        payload.race_id = pbSelectedRace.id;
        payload.heat_id = pbSelectedHeat.id;
        payload.distance_m = pbSelectedHeat.distance_m;
      } else {
        payload.distance_m = parseInt(pbForm.distance_m);
        if (!payload.distance_m) { setPbSaving(false); return; }
        payload.competition_name = pbForm.competition_name || undefined;
      }
      await addAthletePB(profile.id, payload);
      setShowPBForm(false);
      const { data } = await getAthleteProfile(profile.id);
      setProfile(data);
    } catch (err) { console.error(err); }
    finally { setPbSaving(false); }
  };

  const ws = startOfWeek(weekDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Athletes Tracking</h2>

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekDate(subWeeks(weekDate, 1))} className="text-blue-600 text-sm">&larr; Prev</button>
        <span className="text-sm font-medium">
          {format(ws, 'MMM d')} - {format(addDays(ws, 6), 'MMM d')}
        </span>
        <button onClick={() => setWeekDate(addWeeks(weekDate, 1))} className="text-blue-600 text-sm">Next &rarr;</button>
      </div>

      {loading ? <Spinner /> : !data ? (
        <p className="text-gray-500">Failed to load</p>
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-2 py-2 text-left text-gray-500 font-medium sticky left-0 bg-gray-50 min-w-[140px]">Athlete</th>
                {weekDays.map((d) => (
                  <th key={format(d, 'yyyy-MM-dd')} className="px-2 py-2 text-center text-gray-500 font-medium min-w-[48px]">
                    {format(d, 'EEE')}
                  </th>
                ))}
                <th className="px-2 py-2 text-center text-gray-500 font-medium min-w-[48px]">km</th>
              </tr>
            </thead>
            <tbody>
              {data.athletes.map((athlete) => (
                <tr key={athlete.id} className="border-t">
                  <td className="px-2 py-2 sticky left-0 bg-white">
                    <button onClick={() => openProfile(athlete.id)} className="text-left">
                      <div className="font-medium truncate max-w-[140px] text-blue-600 hover:underline">{athlete.full_name}</div>
                      <div className="text-[10px] text-gray-400">{athlete.group_name || 'No group'}</div>
                    </button>
                  </td>
                  {athlete.days.map((d) => {
                    const log = d.log;
                    const hasTarget = !!d.target;
                    let bg = 'bg-gray-100';
                    let text = '-';
                    if (log) {
                      const st = log.status || (log.completed ? 'completed' : 'missed');
                      bg = st === 'completed' ? 'bg-green-100' : st === 'partial' ? 'bg-yellow-100' : 'bg-red-100';
                      if (log.distance_km && log.distance_km > 0) {
                        text = log.distance_km < 10 ? log.distance_km.toFixed(1) : Math.round(log.distance_km).toString();
                      } else {
                        text = st === 'completed' ? 'V' : st === 'partial' ? '~' : 'X';
                      }
                    }
                    return (
                      <td key={d.date} className="px-2 py-2 text-center">
                        <button
                          onClick={() => openCell(athlete, d)}
                          className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${bg} font-bold text-[10px] hover:ring-2 hover:ring-blue-400 transition relative`}
                          title={log?.notes || ''}
                        >
                          {text}
                          {hasTarget && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500" />
                          )}
                          {log?.kudos_count > 0 && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-pink-400" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center">
                    {(() => {
                      const total = athlete.days.reduce((s, d) => s + (d.log?.distance_km || 0), 0);
                      return total > 0 ? (
                        <span className="text-xs font-bold text-blue-700">{total.toFixed(1)}</span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={profileLoading || !!profile} onClose={() => { setProfile(null); setProfileLoading(false); }}
        title={profile ? profile.full_name : 'Loading...'}>
        {profileLoading ? <Spinner /> : profile && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
                {profile.full_name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-lg">{profile.full_name}</p>
                <p className="text-sm text-gray-500">@{profile.username}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500 text-xs">Gender</p>
                <p className="font-medium">{profile.gender === 'M' ? 'Male' : 'Female'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500 text-xs">Group</p>
                <p className="font-medium">{profile.group_name || 'No group'}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-green-700">{profile.stats.completed}</p>
                <p className="text-xs text-green-600">Completed</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-red-700">{profile.stats.missed}</p>
                <p className="text-xs text-red-600">Missed</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-blue-700">{profile.stats.completion_rate}%</p>
                <p className="text-xs text-blue-600">Rate</p>
              </div>
            </div>

            {(() => {
              const renderDay = (d) => {
                const dayDate = new Date(d.date + 'T00:00');
                return (
                  <button
                    key={d.date}
                    onClick={() => openCell({ id: profile.id, full_name: profile.full_name, group_name: profile.group_name }, d)}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm hover:ring-2 hover:ring-blue-300 transition ${d.log ? (
                      d.log.completed ? 'bg-green-50' : d.log.status === 'partial' ? 'bg-yellow-50' : 'bg-red-50'
                    ) : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700 text-xs">{format(dayDate, 'EEE, MMM d')}</span>
                      <span className={`text-xs font-bold ${d.log ? (
                        d.log.completed ? 'text-green-700' : d.log.status === 'partial' ? 'text-yellow-700' : 'text-red-700'
                      ) : 'text-gray-400'}`}>
                        {d.log ? (d.log.completed ? 'V' : d.log.status === 'partial' ? '~' : 'X') : '-'}
                      </span>
                    </div>
                    {d.target?.override_group && d.target?.note ? (
                      <p className="text-xs text-blue-600 mt-1 whitespace-pre-wrap">{d.target.note}</p>
                    ) : (
                      <>
                        {d.group_workout?.content && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{d.group_workout.content}</p>}
                        {d.target?.note && <p className="text-xs text-blue-600 mt-1 whitespace-pre-wrap">Personal: {d.target.note}</p>}
                      </>
                    )}
                    {d.log?.notes && <p className="text-xs text-gray-500 mt-1 italic">{d.log.notes}</p>}
                  </button>
                );
              };

              const monthDays = profileMonth ? profileMonth.weeks.flat().filter(d => isSameMonth(new Date(d.date + 'T00:00'), profileMonthDate)) : null;
              const days = profileViewMode === 'month' ? monthDays : profileWeek?.days;
              const volume = days ? days.reduce((s, d) => s + (d.log?.distance_km || 0), 0) : 0;
              const volumeLabel = profileViewMode === 'month' ? 'this month' : 'this week';

              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500">Training</p>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setProfileViewMode('week')}
                        className={`px-2.5 py-0.5 text-xs font-medium transition ${profileViewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>
                        Week
                      </button>
                      <button
                        onClick={() => setProfileViewMode('month')}
                        className={`px-2.5 py-0.5 text-xs font-medium transition ${profileViewMode === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>
                        Month
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end mb-2">
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 rounded-full px-2.5 py-0.5">
                      {volume > 0 ? `${volume.toFixed(1)} km ${volumeLabel}` : 'No km logged'}
                    </span>
                  </div>

                  {profileViewMode === 'week' ? (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <button onClick={() => setProfileWeekDate(subWeeks(profileWeekDate, 1))} className="text-blue-600 text-xs">&larr;</button>
                        <span className="text-xs font-medium">
                          {format(startOfWeek(profileWeekDate, { weekStartsOn: 0 }), 'MMM d')} - {format(addDays(startOfWeek(profileWeekDate, { weekStartsOn: 0 }), 6), 'MMM d')}
                        </span>
                        <button onClick={() => setProfileWeekDate(addWeeks(profileWeekDate, 1))} className="text-blue-600 text-xs">&rarr;</button>
                      </div>
                      {profileWeek ? (
                        <div className="space-y-1.5">{profileWeek.days.map(renderDay)}</div>
                      ) : <Spinner />}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <button onClick={() => setProfileMonthDate(subMonths(profileMonthDate, 1))} className="text-blue-600 text-xs">&larr;</button>
                        <span className="text-xs font-medium">{format(profileMonthDate, 'MMMM yyyy')}</span>
                        <button onClick={() => setProfileMonthDate(addMonths(profileMonthDate, 1))} className="text-blue-600 text-xs">&rarr;</button>
                      </div>
                      {profileMonth ? (
                        <div className="max-h-[60vh] overflow-y-auto">
                          <div className="grid grid-cols-7 gap-0.5 mb-1 text-[10px] text-gray-400 text-center font-medium">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
                          </div>
                          <div className="space-y-0.5">
                            {profileMonth.weeks.map((week, wi) => (
                              <div key={wi} className="grid grid-cols-7 gap-0.5">
                                {week.map(d => {
                                  const dayDate = new Date(d.date + 'T00:00');
                                  const inMonth = isSameMonth(dayDate, profileMonthDate);
                                  const status = d.log ? (d.log.status || (d.log.completed ? 'completed' : 'missed')) : null;
                                  const bg = !inMonth ? 'bg-transparent' :
                                    status === 'completed' ? 'bg-green-100 hover:bg-green-200' :
                                    status === 'partial' ? 'bg-yellow-100 hover:bg-yellow-200' :
                                    status === 'missed' ? 'bg-red-100 hover:bg-red-200' :
                                    'bg-gray-50 hover:bg-gray-100';
                                  const icon = status === 'completed' ? 'V' : status === 'partial' ? '~' : status === 'missed' ? 'X' : '';
                                  const hasPersonal = d.target?.note;
                                  if (!inMonth) {
                                    return <div key={d.date} className="aspect-square" />;
                                  }
                                  return (
                                    <button
                                      key={d.date}
                                      onClick={() => openCell({ id: profile.id, full_name: profile.full_name, group_name: profile.group_name }, d)}
                                      className={`aspect-square rounded-md ${bg} relative flex flex-col items-center justify-center transition`}
                                      title={d.group_workout?.content || d.target?.note || ''}
                                    >
                                      <span className="text-[10px] text-gray-500 leading-none">{format(dayDate, 'd')}</span>
                                      {icon && <span className="text-xs font-bold leading-none mt-0.5">{icon}</span>}
                                      {hasPersonal && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                      {d.log?.distance_km > 0 && (
                                        <span className="text-[9px] text-blue-700 font-semibold leading-none mt-0.5">{d.log.distance_km.toFixed(1)}k</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : <Spinner />}
                    </>
                  )}
                </div>
              );
            })()}

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500">Personal Bests</p>
                <button onClick={openPBForm} className="text-xs text-blue-600 hover:underline font-medium">+ Add PB</button>
              </div>
              {showPBForm && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-2 space-y-3">
                  <div className="flex rounded-lg border border-yellow-300 overflow-hidden">
                    <button onClick={() => setPbMode('manual')}
                      className={`flex-1 py-1.5 text-xs font-medium transition ${pbMode === 'manual' ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600'}`}>
                      Manual Entry
                    </button>
                    <button onClick={() => setPbMode('race')}
                      className={`flex-1 py-1.5 text-xs font-medium transition ${pbMode === 'race' ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600'}`}>
                      From Race
                    </button>
                  </div>

                  {pbMode === 'manual' ? (
                    <>
                      <select value={pbForm.distance_m} onChange={(e) => setPbForm({ ...pbForm, distance_m: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm">
                        <option value="">Select distance</option>
                        <option value="1500">1,500m</option>
                        <option value="3000">3,000m</option>
                        <option value="5000">5,000m</option>
                        <option value="10000">10,000m</option>
                        <option value="21100">Half Marathon</option>
                        <option value="42200">Marathon</option>
                      </select>
                      <input placeholder="Competition name (optional)" value={pbForm.competition_name}
                        onChange={(e) => setPbForm({ ...pbForm, competition_name: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm" />
                    </>
                  ) : (
                    <>
                      <select onChange={(e) => handleSelectRace(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm">
                        <option value="">Select race</option>
                        {pbRaces.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.race_date})</option>)}
                      </select>
                      {pbHeats.length > 0 && (
                        <select onChange={(e) => setPbSelectedHeat(pbHeats.find(h => h.id === parseInt(e.target.value)) || null)}
                          className="w-full border rounded-lg px-3 py-2 text-sm">
                          <option value="">Select heat</option>
                          {pbHeats.map((h) => <option key={h.id} value={h.id}>{h.label} ({h.distance_m}m)</option>)}
                        </select>
                      )}
                    </>
                  )}

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500">Min</label>
                      <input type="number" min="0" placeholder="mm" value={pbForm.time_min}
                        onChange={(e) => setPbForm({ ...pbForm, time_min: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500">Sec</label>
                      <input type="number" min="0" max="59" placeholder="ss" value={pbForm.time_sec}
                        onChange={(e) => setPbForm({ ...pbForm, time_sec: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={handleSavePB} disabled={pbSaving}
                      className="flex-1 bg-yellow-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-yellow-600 disabled:opacity-50">
                      {pbSaving ? 'Saving...' : 'Save PB'}
                    </button>
                    <button onClick={() => setShowPBForm(false)}
                      className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {profile.personal_bests?.length > 0 ? (
                <div className="space-y-1.5">
                  {profile.personal_bests.map((pb) => (
                    <div key={pb.distance_m} className="flex items-center justify-between bg-yellow-50 rounded-lg px-3 py-2 text-sm">
                      <span className="font-semibold text-yellow-800">{pb.distance_display}</span>
                      <div className="text-right">
                        <span className="font-bold text-yellow-900">{pb.time_display}</span>
                        <span className="text-xs text-gray-500 ml-2">{pb.race_name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !showPBForm && (
                <p className="text-xs text-gray-400 text-center py-2">No personal bests yet</p>
              )}
            </div>

            {profile.race_history?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Race History</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {profile.race_history.map((r, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-gray-800">{r.race_name}</p>
                        <p className="text-xs text-gray-500">{format(new Date(r.race_date + 'T00:00'), 'MMM d, yyyy')} · {r.distance_display}</p>
                      </div>
                      <span className="font-semibold text-gray-700">{r.time_display}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profile.recent_logs?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Recent Activity</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {profile.recent_logs.map((log) => (
                    <div key={log.date} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${log.completed ? 'bg-green-50' : 'bg-red-50'}`}>
                      <span className="text-gray-700">{format(new Date(log.date + 'T00:00'), 'EEE, MMM d')}</span>
                      <div className="flex items-center gap-2">
                        {log.notes && <span className="text-xs text-gray-500 truncate max-w-[120px]">{log.notes}</span>}
                        <span className={`font-medium ${log.completed ? 'text-green-700' : 'text-red-700'}`}>
                          {log.completed ? 'V' : 'X'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profile.created_at && (
              <p className="text-xs text-gray-400 text-center">
                Member since {format(new Date(profile.created_at), 'MMM d, yyyy')}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)}
        title={selected ? `${selected.athlete.full_name} — ${format(new Date(selected.day.date + 'T00:00'), 'EEE, MMM d')}` : ''}>
        {selected && (
          <div className="space-y-4">
            {/* Group workout section */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">
                Group Workout ({selected.athlete.group_name || 'No group'})
              </p>
              {selected.day.group_workout?.content ? (
                <p className="text-sm whitespace-pre-wrap">{selected.day.group_workout.content}</p>
              ) : (
                <p className="text-sm text-gray-400 italic">No group workout for this day</p>
              )}
            </div>

            {/* Athlete report section */}
            <div className={`rounded-lg p-3 ${selected.day.log ? (
              (selected.day.log.status || (selected.day.log.completed ? 'completed' : 'missed')) === 'completed' ? 'bg-green-50' :
              (selected.day.log.status || (selected.day.log.completed ? 'completed' : 'missed')) === 'partial' ? 'bg-yellow-50' : 'bg-red-50'
            ) : 'bg-gray-50'}`}>
              <p className="text-xs font-semibold text-gray-500 mb-1">Athlete Report</p>
              {selected.day.log ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{
                      (selected.day.log.status || (selected.day.log.completed ? 'completed' : 'missed')) === 'completed' ? 'Completed' :
                      (selected.day.log.status || (selected.day.log.completed ? 'completed' : 'missed')) === 'partial' ? 'Half Completed' : 'Missed'
                    }</p>
                    <span className="text-sm font-bold text-blue-700">
                      {selected.day.log.distance_km > 0 ? `${selected.day.log.distance_km.toFixed(1)} km` : '— km'}
                    </span>
                  </div>
                  {selected.day.log.notes && <p className="text-sm text-gray-600 mt-1">{selected.day.log.notes}</p>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {selected.day.log.id && (() => {
                      const REACTIONS = [
                        { key: 'clap', icon: '👏', activeBg: 'bg-pink-100', activeText: 'text-pink-700', activeBorder: 'border-pink-300', hoverBg: 'hover:bg-pink-50' },
                        { key: 'heart', icon: '❤️', activeBg: 'bg-red-100', activeText: 'text-red-700', activeBorder: 'border-red-300', hoverBg: 'hover:bg-red-50' },
                        { key: 'dislike', icon: '👎', activeBg: 'bg-gray-200', activeText: 'text-gray-800', activeBorder: 'border-gray-400', hoverBg: 'hover:bg-gray-100' },
                      ];
                      const reactions = selected.day.log.reactions || [];
                      const find = (key) => reactions.find(r => r.emoji === key);
                      return REACTIONS.map(({ key, icon, activeBg, activeText, activeBorder, hoverBg }) => {
                        const r = find(key);
                        const reacted = r?.reacted;
                        const count = r?.count || 0;
                        return (
                          <button
                            key={key}
                            onClick={async () => {
                              const { data: res } = await toggleKudos(selected.day.log.id, key);
                              const total = (res.reactions || []).reduce((s, x) => s + x.count, 0);
                              setSelected({
                                ...selected,
                                day: { ...selected.day, log: { ...selected.day.log, reactions: res.reactions, kudos_count: total } },
                              });
                              fetchData();
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                              reacted ? `${activeBg} ${activeText} ${activeBorder}` : `bg-gray-50 text-gray-500 border-gray-200 ${hoverBg}`
                            }`}
                          >
                            <span>{icon}</span>
                            {count > 0 && <span>{count}</span>}
                          </button>
                        );
                      });
                    })()}
                    <a
                      href="https://www.strava.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200 transition"
                      title="Strava integration coming soon"
                    >
                      <span>🏃</span>
                      <span>Open in Strava</span>
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 italic">No report submitted</p>
              )}
            </div>

            {/* Personal workout section */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">Personal Workout</p>
              <textarea
                value={personalNote}
                onChange={(e) => setPersonalNote(e.target.value)}
                placeholder="Write a personal workout for this athlete..."
                rows={2}
                className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50/50"
              />
              {personalNote.trim() && (
                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={overrideGroup}
                    onChange={(e) => setOverrideGroup(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-xs text-gray-600">Show this instead of group workout</span>
                </label>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={handleSavePersonal} disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setSelected(null)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
