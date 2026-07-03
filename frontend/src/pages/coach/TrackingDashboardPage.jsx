import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { format, addDays, startOfWeek, subWeeks, addWeeks, startOfMonth, endOfMonth, subMonths, addMonths, isSameMonth } from 'date-fns';
import { getDashboardWeek, getAthleteProfile, getAthleteWeek, addAthletePB } from '../../api/coach';
import { listRaces, getRace, updateResult, deleteResult, updateRace } from '../../api/races';

const WORKOUT_TYPES = [
  { value: 'simple',    label: 'Other',     color: 'bg-gray-100 text-gray-700',       structured: false },
  { value: 'easy',      label: 'Easy run',  color: 'bg-emerald-100 text-emerald-700', structured: false },
  { value: 'rest',      label: 'Rest day',  color: 'bg-slate-100 text-slate-700',     structured: false },
  { value: 'tempo',     label: 'Tempo',     color: 'bg-orange-100 text-orange-700',   structured: true },
  { value: 'long',      label: 'Long run',  color: 'bg-purple-100 text-purple-700',   structured: true },
  { value: 'intervals', label: 'Intervals', color: 'bg-red-100 text-red-700',         structured: true },
  { value: 'fartlek',   label: 'Fartlek',   color: 'bg-pink-100 text-pink-700',       structured: true },
  { value: 'race',      label: 'Race',      color: 'bg-indigo-100 text-indigo-700',   structured: true, mainLabel: 'Race' },
  { value: 'strength',  label: 'Strength',  color: 'bg-amber-100 text-amber-700',     structured: false },
  { value: 'cycling',   label: 'Cycling',   color: 'bg-cyan-100 text-cyan-700',       structured: false },
];
const typeMetaFor = (t) => WORKOUT_TYPES.find(x => x.value === t) || WORKOUT_TYPES[0];
const DEFAULT_TITLES = new Set(WORKOUT_TYPES.map(t => t.label));
// Planned km of a day = sum of the workouts the athlete actually sees (group
// workout unless hidden for the day, plus 'additional' personal workouts).
const plannedKm = (d) => visibleDayPlannedKm(d);
const fmtKm = (n) => Number(n.toFixed(1)).toString();
import { createTarget, updateTargetById, deleteTargetById, promoteTarget, setGroupVisibility } from '../../api/calendar';
import { dayWorkouts, visibleDayWorkouts, visibleDayPlannedKm, tracksDistance } from '../../constants/workouts';
import { toggleKudos } from '../../api/kudos';
import { getAthleteStravaActivities } from '../../api/strava';
import Modal from '../../components/ui/Modal';
import { NoiseBackground } from '../../components/ui/NoiseBackground';

import StravaActivityDetail from '../../components/StravaActivityDetail';
import Spinner from '../../components/ui/Spinner';
import WorkoutCommentThread from '../../components/WorkoutCommentThread';

export default function TrackingDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [weekDate, setWeekDate] = useState(new Date());
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [personalForm, setPersonalForm] = useState({
    workout_type: 'simple', title: '', content: '', note: '',
    warmup: '', main_session: '', cooldown: '', distance_km: '',
  });
  const [additional, setAdditional] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Local checkbox state for "don't show group workout today" — applied only when
  // the coach clicks Apply, so it's not conflated with the personal-workout Add.
  const [pendingHide, setPendingHide] = useState(false);
  // The add/edit personal-workout form is collapsed until the coach opens it via
  // "+ Add workout" or "Edit" on an existing one.
  const [showTargetForm, setShowTargetForm] = useState(false);
  // null = the form is creating a new personal workout; id = editing that one.
  const [editingTargetId, setEditingTargetId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileWeekDate, setProfileWeekDate] = useState(new Date());
  const [profileWeek, setProfileWeek] = useState(null);
  const [profileViewMode, setProfileViewMode] = useState('week');
  const [profileMonthDate, setProfileMonthDate] = useState(new Date());
  const [profileMonth, setProfileMonth] = useState(null);
  const [monthExpanded, setMonthExpanded] = useState(false);
  // Carousel index per day in the expanded monthly grid: { 'YYYY-MM-DD': index }.
  // Lets a cell with multiple workouts switch which single one it displays.
  const [cellIdx, setCellIdx] = useState({});
  // When a day is opened from the expanded month view, closing it should return there.
  const [returnToExpanded, setReturnToExpanded] = useState(false);
  const [expandedZoom, setExpandedZoom] = useState(0.75);
  const expandedScrollRef = useRef(null);
  const addFormRef = useRef(null);  // the bottom add/edit form, for scroll-into-view
  const pinchRef = useRef({ startDist: 0, startZoom: 1 });

  useEffect(() => {
    if (!monthExpanded) return;
    const el = expandedScrollRef.current;
    if (!el) return;

    const clamp = (v) => +Math.max(0.3, Math.min(1.8, v)).toFixed(2);

    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setExpandedZoom((z) => clamp(z + delta));
    };

    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current.startDist = Math.hypot(dx, dy);
      setExpandedZoom((z) => {
        pinchRef.current.startZoom = z;
        return z;
      });
    };

    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || !pinchRef.current.startDist) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const ratio = newDist / pinchRef.current.startDist;
      setExpandedZoom(clamp(pinchRef.current.startZoom * ratio));
    };

    const onTouchEnd = () => {
      pinchRef.current.startDist = 0;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [monthExpanded]);

  // Editing a PB / manual race history result
  const [editingResult, setEditingResult] = useState(null);
  const [editResultMin, setEditResultMin] = useState('');
  const [editResultSec, setEditResultSec] = useState('');
  const [editResultName, setEditResultName] = useState('');
  const [editResultSaving, setEditResultSaving] = useState(false);

  const [stravaActivities, setStravaActivities] = useState(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [selectedStravaActivity, setSelectedStravaActivity] = useState(null);

  // Auto-fetch Strava activities when a day is opened. Silently hides if the
  // athlete has not connected Strava (409) or if the fetch fails.
  useEffect(() => {
    setStravaActivities(null);
    if (!selected) return;
    setStravaLoading(true);
    getAthleteStravaActivities(selected.athlete.id, selected.day.date)
      .then(({ data }) => setStravaActivities(data))
      .catch(() => setStravaActivities(null))
      .finally(() => setStravaLoading(false));
  }, [selected]);

  const openEditResult = (item) => {
    setEditingResult(item);
    const total = item.time_seconds || 0;
    setEditResultMin(Math.floor(total / 60).toString());
    setEditResultSec((total % 60).toString().padStart(2, '0'));
    setEditResultName(item.race_name || '');
  };

  const handleSaveEditResult = async () => {
    if (!editingResult || !profile) return;
    const min = parseInt(editResultMin) || 0;
    const sec = parseInt(editResultSec) || 0;
    const totalSec = min * 60 + sec;
    if (totalSec <= 0) return;
    setEditResultSaving(true);
    try {
      const timeRaw = `${min}:${sec.toString().padStart(2, '0')}`;
      await updateResult(editingResult.race_id, editingResult.heat_id, editingResult.result_id, {
        athlete_name: profile.full_name,
        time_raw: timeRaw,
        gender: profile.gender,
      });
      if (editingResult.is_manual && editResultName.trim() !== (editingResult.race_name || '')) {
        await updateRace(editingResult.race_id, { name: editResultName.trim() });
      }
      const { data } = await getAthleteProfile(profile.id);
      setProfile(data);
      setEditingResult(null);
    } catch (err) { console.error(err); }
    finally { setEditResultSaving(false); }
  };

  const handleDeleteResult = async (item) => {
    if (!profile) return;
    if (!window.confirm(`Delete this ${item.distance_display || item.distance_m + 'm'} entry?`)) return;
    try {
      await deleteResult(item.race_id, item.heat_id, item.result_id);
      const { data } = await getAthleteProfile(profile.id);
      setProfile(data);
    } catch (err) { console.error(err); }
  };
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

  // Load a target into the form (t = null → empty "add" form).
  const seedForm = (t) => {
    setPersonalForm({
      workout_type: t?.workout_type || 'simple',
      title: t?.title || '',
      content: t?.content || '',
      note: t?.note || '',
      warmup: t?.warmup || '',
      main_session: t?.main_session || '',
      cooldown: t?.cooldown || '',
      distance_km: t?.distance_km ?? '',
    });
    setAdditional(t?.additional || false);
    setHidden(t?.hidden || false);
    setEditingTargetId(t?.id || null);
  };

  const openTargetForm = (t) => {
    seedForm(t);
    setShowTargetForm(true);
  };

  const openCell = (athlete, dayData, fromExpanded = false) => {
    setReturnToExpanded(fromExpanded);
    setSelected({ athlete, day: dayData });
    setPendingHide(!!dayData.hide_group);
    setShowTargetForm(false);  // add/edit form starts collapsed
    seedForm(null);  // existing workouts show in a list; the form starts as "add"
  };

  // Deep-link: when navigated from the coach home "Latest reports" list, open that
  // athlete's day report directly. Clear the nav state so it doesn't reopen on back.
  useEffect(() => {
    const st = location.state;
    if (!st?.openAthleteId || !st?.openDate) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await getAthleteWeek(st.openAthleteId, st.openDate);
        const day = data.days.find((x) => x.date === st.openDate);
        if (alive && day) {
          openCell({ id: st.openAthleteId, full_name: st.athleteName || '', group_name: st.groupName || '' }, day);
        }
      } catch (e) { console.error(e); }
    })();
    navigate(location.pathname, { replace: true, state: null });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const refreshSelectedDay = async () => {
    if (!selected) return;
    const { data } = await getAthleteWeek(selected.athlete.id, selected.day.date);
    const fresh = data.days.find((x) => x.date === selected.day.date);
    if (fresh) setSelected((s) => ({ ...s, day: fresh }));
  };

  // Day-level "don't show group workout today" — committed via the Apply button
  // next to the checkbox, not on every checkbox click.
  const applyGroupHide = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await setGroupVisibility(selected.athlete.id, selected.day.date, pendingHide);
      await refreshSelectedDay();
      fetchData();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const toggleGroupHide = async () => {
    if (!selected) return;
    const next = !selected.day.hide_group;
    setSaving(true);
    try {
      await setGroupVisibility(selected.athlete.id, selected.day.date, next);
      setPendingHide(next);
      await refreshSelectedDay();
      fetchData();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const deleteTargetRow = async (t) => {
    if (!t?.id) return;
    setSaving(true);
    try { await deleteTargetById(t.id); await refreshSelectedDay(); fetchData(); }
    catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  // Close the day detail; return to the expanded month view if we came from it.
  const closeSelected = () => {
    setSelected(null);
    if (returnToExpanded) { setMonthExpanded(true); setReturnToExpanded(false); }
  };

  const handleSavePersonal = async (hiddenOverride) => {
    const isHidden = typeof hiddenOverride === 'boolean' ? hiddenOverride : hidden;
    setSaving(true);
    try {
      const f = personalForm;
      const structured = ['tempo', 'long', 'intervals', 'fartlek', 'race'].includes(f.workout_type);
      const hasContent = (structured
        ? (f.warmup.trim() || f.main_session.trim() || f.cooldown.trim() || f.title.trim())
        : ((f.content || '').trim() || f.title.trim()))
        || (f.note || '').trim();

      if (hasContent) {
        const payload = {
          note: f.note,
          additional: additional,
          workout_type: f.workout_type,
          title: f.title,
          content: structured ? '' : (f.content || ''),
          warmup: structured ? f.warmup : '',
          main_session: structured ? f.main_session : '',
          cooldown: structured ? f.cooldown : '',
          distance_km: !tracksDistance(f.workout_type) || f.distance_km === '' || f.distance_km == null ? null : parseFloat(f.distance_km),
          hidden: isHidden,
        };
        if (editingTargetId) await updateTargetById(editingTargetId, payload);
        else await createTarget(selected.athlete.id, selected.day.date, payload);
      } else if (editingTargetId) {
        await deleteTargetById(editingTargetId);
      }
      seedForm(null);            // reset to "add" so the coach can add another
      setShowTargetForm(false);  // collapse the form back down after saving
      await refreshSelectedDay();  // refresh the day's list in place
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
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />
      <h2 className="text-xl font-bold mb-4 text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">Athletes Tracking</h2>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search member by name…"
        className="w-full mb-4 bg-black/40 border border-white/15 placeholder-white/40 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      />

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekDate(subWeeks(weekDate, 1))} className="text-white hover:text-white/80 text-sm transition">&larr; Prev</button>
        <span className="text-sm font-medium text-white/85">
          {format(ws, 'MMM d')} - {format(addDays(ws, 6), 'MMM d')}
        </span>
        <button onClick={() => setWeekDate(addWeeks(weekDate, 1))} className="text-white hover:text-white/80 text-sm transition">Next &rarr;</button>
      </div>

      {loading ? <Spinner /> : !data ? (
        <p className="text-white/50">Failed to load</p>
      ) : (
        <div className="bg-gradient-to-br from-[#201f20]/85 to-[#131314]/75 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/[0.05] border-b border-white/10">
                <th className="px-2 py-2 text-left text-white/65 font-medium sticky left-0 z-20 bg-[#201f20] min-w-[140px] shadow-[1px_0_0_0_rgba(255,255,255,0.1)]">Athlete</th>
                {weekDays.map((d) => (
                  <th key={format(d, 'yyyy-MM-dd')} className="px-2 py-2 text-center text-white/65 font-medium min-w-[48px]">
                    {format(d, 'EEE')}
                  </th>
                ))}
                <th className="px-2 py-2 text-center text-white/65 font-medium min-w-[48px]">km</th>
              </tr>
            </thead>
            <tbody>
              {data.athletes
                .filter((a) => a.full_name.toLowerCase().includes(search.trim().toLowerCase()))
                .map((athlete) => (
                <tr key={athlete.id} className="border-t border-white/10">
                  <td className="px-2 py-2 sticky left-0 z-10 bg-[#161516] shadow-[1px_0_0_0_rgba(255,255,255,0.1)]">
                    <button onClick={() => openProfile(athlete.id)} className="text-left">
                      <div className="font-medium truncate max-w-[140px] text-white hover:underline">{athlete.full_name}</div>
                      <div className="text-[10px] text-white/45">{athlete.group_name || 'No group'}</div>
                    </button>
                  </td>
                  {athlete.days.map((d) => {
                    const log = d.log;
                    const hasTarget = !!d.target;
                    const cellIsRace = visibleDayWorkouts(d)[0]?.workout_type === 'race';
                    let bg = 'bg-white/15';
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
                          className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${bg} font-bold text-[10px] hover:ring-2 hover:ring-blue-400 transition relative ${cellIsRace ? 'ring-2 ring-indigo-500' : ''}`}
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
                        <span className="text-xs font-bold text-blue-200">{total.toFixed(1)}</span>
                      ) : (
                        <span className="text-xs text-white/30">-</span>
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
        title={profile ? profile.full_name : 'Loading...'}
        panelClassName="bg-black border-t border-white/10">
        {profileLoading ? <Spinner /> : profile && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-500/25 border border-blue-300/40 flex items-center justify-center text-blue-100 font-bold text-lg">
                {profile.full_name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-lg text-white">{profile.full_name}</p>
                <p className="text-sm text-white/55">@{profile.username}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white/10 border border-white/15 rounded-lg p-3">
                <p className="text-white/50 text-xs">Gender</p>
                <p className="font-medium text-white">{profile.gender === 'M' ? 'Male' : 'Female'}</p>
              </div>
              <div className="bg-white/10 border border-white/15 rounded-lg p-3">
                <p className="text-white/50 text-xs">Group</p>
                <p className="font-medium text-white">{profile.group_name || 'No group'}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-green-500/15 border border-green-400/30 rounded-lg p-3">
                <p className="text-2xl font-bold text-green-200">{profile.stats.completed}</p>
                <p className="text-xs text-green-300/80">Completed</p>
              </div>
              <div className="bg-red-500/15 border border-red-400/30 rounded-lg p-3">
                <p className="text-2xl font-bold text-red-200">{profile.stats.missed}</p>
                <p className="text-xs text-red-300/80">Missed</p>
              </div>
              <div className="bg-blue-500/15 border border-blue-400/30 rounded-lg p-3">
                <p className="text-2xl font-bold text-blue-200">{profile.stats.completion_rate}%</p>
                <p className="text-xs text-blue-300/80">Rate</p>
              </div>
            </div>

            {(() => {
              // The workouts the athlete actually sees that day (group unless hidden
              // for the day, plus 'additional' personals). Index 0 is the main cell.
              const orderedDay = (d) => visibleDayWorkouts(d);

              const renderDay = (d) => {
                const dayDate = new Date(d.date + 'T00:00');
                const ordered = orderedDay(d);
                const multi = ordered.length > 1;
                const cur = Math.min(cellIdx[d.date] || 0, Math.max(0, ordered.length - 1));
                const active = ordered[cur] || null;
                const isPersonal = active?._source === 'personal';
                const w = active
                  ? { title: active.title || (isPersonal ? 'Personal' : ''), snippet: active.content || active.main_session || active.warmup || '', color: isPersonal ? 'text-blue-700' : 'text-gray-700' }
                  : null;
                const dispKm = multi ? (active?.distance_km || 0) : plannedKm(d);
                const hiddenDay = isPersonal && !!active?.hidden;
                const cellIsRace = active?.workout_type === 'race';
                const status = d.log ? (d.log.status || (d.log.completed ? 'completed' : 'missed')) : null;
                const cellBg = hiddenDay
                  ? 'bg-white/[0.06] border-dashed border-white/25'
                  : cellIsRace
                  ? 'bg-indigo-500/15 border-indigo-400/40'
                  : status === 'completed' ? 'bg-green-500/15 border-green-400/30'
                  : status === 'partial' ? 'bg-yellow-500/15 border-yellow-400/30'
                  : status === 'missed' ? 'bg-red-500/15 border-red-400/30'
                  : 'bg-white/5 border-white/15';
                const iconColor = status === 'completed' ? 'text-green-200'
                  : status === 'partial' ? 'text-yellow-200'
                  : status === 'missed' ? 'text-red-200'
                  : 'text-white/35';
                const titleColor = w?.color === 'text-blue-700' ? 'text-blue-200' : 'text-white/85';
                return (
                  <button
                    key={d.date}
                    onClick={() => openCell({ id: profile.id, full_name: profile.full_name, group_name: profile.group_name }, d)}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm border hover:bg-white/10 transition ${cellBg} ${cellIsRace ? 'border-2' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium text-white/80 text-xs">{cellIsRace && '🏁 '}{format(dayDate, 'EEE, MMM d')}{hiddenDay && ' ·  hidden'}</span>
                        {multi && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setCellIdx((m) => ({ ...m, [d.date]: (cur + 1) % ordered.length })); }}
                            className="shrink-0 inline-flex items-center text-[10px] font-bold text-[#c0c1ff] bg-white/10 hover:bg-white/20 rounded-full px-1.5 py-0.5 transition"
                            title="Switch workout"
                          >
                            {cur + 1}/{ordered.length} ›
                          </button>
                        )}
                      </span>
                      <span className="flex flex-col items-end gap-0.5">
                        <span className="flex items-center gap-1.5">
                          {d.log?.distance_km > 0 && <span className="text-xs font-semibold text-[#c0c1ff]">{Number(d.log.distance_km).toFixed(1)} km</span>}
                          <span className={`text-xs font-bold ${iconColor}`}>
                            {d.log ? (d.log.completed ? 'V' : d.log.status === 'partial' ? '~' : 'X') : '-'}
                          </span>
                        </span>
                        {multi && plannedKm(d) > 0 && <span className="text-[11px] font-semibold text-white/55">Daily {fmtKm(plannedKm(d))} km</span>}
                      </span>
                    </div>
                    {w && (w.title || w.snippet) && (
                      <div className="mt-1">
                        {w.title && <p className={`text-xs font-semibold ${titleColor}`}>{w.title}{dispKm > 0 && <span className="text-white/45 font-normal"> · {fmtKm(dispKm)} km</span>}</p>}
                        {w.snippet && <p className="text-xs text-white/65 whitespace-pre-wrap truncate">{w.snippet}</p>}
                      </div>
                    )}
                    {d.log?.notes && <p className="text-xs text-white/55 mt-1 italic">{d.log.notes}</p>}
                  </button>
                );
              };

              const monthDays = profileMonth ? profileMonth.weeks.flat().filter(d => isSameMonth(new Date(d.date + 'T00:00'), profileMonthDate)) : null;
              const days = profileViewMode === 'month' ? monthDays : profileWeek?.days;
              const volume = days ? days.reduce((s, d) => s + (d.log?.distance_km || 0), 0) : 0;
              const expectedVolume = days ? days.reduce((s, d) => s + plannedKm(d), 0) : 0;
              const volumeLabel = profileViewMode === 'month' ? 'this month' : 'this week';

              return (
                <div>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-white/50">Training</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/coach/athletes/${profile.id}/volume`, { state: { athleteName: profile.full_name } })}
                        className="w-7 h-7 rounded-lg bg-[#c0c1ff]/10 border border-[#c0c1ff]/20 flex items-center justify-center hover:bg-[#c0c1ff]/20 active:scale-95 transition shrink-0"
                        aria-label="Open volume breakdown"
                        title="Volume diagrams"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="#c0c1ff" strokeWidth={1.6} className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => navigate(`/coach/athletes/${profile.id}/progress`, { state: { athleteName: profile.full_name } })}
                        className="flex items-center gap-1 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold px-2.5 py-0.5 rounded-lg transition active:scale-95"
                        title="View volume, consistency, race history"
                      >
                        Progress <span className="leading-none">›</span>
                      </button>
                      <div className="flex rounded-lg border border-white/15 overflow-hidden">
                        <button
                          onClick={() => setProfileViewMode('week')}
                          className={`px-2.5 py-0.5 text-xs font-medium transition ${profileViewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}>
                          Week
                        </button>
                        <button
                          onClick={() => setProfileViewMode('month')}
                          className={`px-2.5 py-0.5 text-xs font-medium transition ${profileViewMode === 'month' ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}>
                          Month
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-0.5 mb-2">
                    <span className="text-xs font-bold text-blue-200 bg-blue-500/20 border border-blue-400/30 rounded-full px-2.5 py-0.5">
                      {volume > 0 ? `${volume.toFixed(1)} km ${volumeLabel}` : 'No km logged'}
                    </span>
                    {expectedVolume > 0 && (
                      <span className="text-xs font-semibold text-white/60">Expected: {fmtKm(expectedVolume)} km</span>
                    )}
                  </div>

                  {profileViewMode === 'week' ? (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <button onClick={() => setProfileWeekDate(subWeeks(profileWeekDate, 1))} className="text-blue-300 hover:text-blue-200 text-xs">&larr;</button>
                        <span className="text-xs font-medium text-white/80">
                          {format(startOfWeek(profileWeekDate, { weekStartsOn: 0 }), 'MMM d')} - {format(addDays(startOfWeek(profileWeekDate, { weekStartsOn: 0 }), 6), 'MMM d')}
                        </span>
                        <button onClick={() => setProfileWeekDate(addWeeks(profileWeekDate, 1))} className="text-blue-300 hover:text-blue-200 text-xs">&rarr;</button>
                      </div>
                      {profileWeek ? (
                        <div className="space-y-1.5">{profileWeek.days.map(renderDay)}</div>
                      ) : <Spinner />}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <button onClick={() => setProfileMonthDate(subMonths(profileMonthDate, 1))} className="text-blue-300 hover:text-blue-200 text-xs">&larr;</button>
                        <span className="text-xs font-medium text-white/80">{format(profileMonthDate, 'MMMM yyyy')}</span>
                        <button onClick={() => setProfileMonthDate(addMonths(profileMonthDate, 1))} className="text-blue-300 hover:text-blue-200 text-xs">&rarr;</button>
                      </div>
                      {profileMonth ? (() => {
                        const TYPE_ABBR = {
                          simple:    { abbr: 'Oth',  color: 'bg-gray-100 text-gray-700' },
                          easy:      { abbr: 'Easy', color: 'bg-emerald-100 text-emerald-700' },
                          rest:      { abbr: 'Rest', color: 'bg-slate-100 text-slate-700' },
                          tempo:     { abbr: 'Tem',  color: 'bg-orange-100 text-orange-700' },
                          long:      { abbr: 'Long', color: 'bg-purple-100 text-purple-700' },
                          intervals: { abbr: 'Int',  color: 'bg-red-100 text-red-700' },
                          fartlek:   { abbr: 'Fart', color: 'bg-pink-100 text-pink-700' },
                          race:      { abbr: 'Race', color: 'bg-indigo-100 text-indigo-700' },
                          strength:  { abbr: 'Str',  color: 'bg-amber-100 text-amber-700' },
                          cycling:   { abbr: 'Cyc',  color: 'bg-cyan-100 text-cyan-700' },
                        };
                        const todayStr = format(new Date(), 'yyyy-MM-dd');
                        return (
                          <div>
                            <NoiseBackground
                              containerClassName="mb-4 w-full rounded-xl p-[2px]"
                              gradientColors={['rgb(37,99,235)', 'rgb(99,102,241)', 'rgb(139,92,246)']}
                            >
                              <button
                                onClick={() => setMonthExpanded(true)}
                                className="w-full rounded-[10px] bg-black/70 hover:bg-black/55 backdrop-blur-sm py-3 text-sm font-semibold tracking-wide text-white transition active:scale-[0.98]"
                              >
                                 Expand monthly view
                              </button>
                            </NoiseBackground>
                            <div className="space-y-4">
                              {profileMonth.weeks.map((week, wi) => {
                                const weekVolume = week.reduce((s, d) => s + (d.log?.distance_km || 0), 0);
                                const expectedKm = week.reduce((s, d) => s + plannedKm(d), 0);
                                return (
                                  <div key={wi}>
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="text-xs text-white/45 font-medium">
                                        {format(new Date(week[0].date + 'T00:00'), 'MMM d')} - {format(new Date(week[6].date + 'T00:00'), 'MMM d')}
                                      </p>
                                      <div className="text-right">
                                        <span className="text-sm font-bold text-white">{weekVolume > 0 ? weekVolume.toFixed(1) : '0'} km</span>
                                        {expectedKm > 0 && <p className="text-[10px] text-white/75 font-normal">exp {fmtKm(expectedKm)} km</p>}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-7 gap-2">
                                      {week.map((d) => {
                                        const dayDate = new Date(d.date + 'T00:00');
                                        const inMonth = isSameMonth(dayDate, profileMonthDate);
                                        const isToday = d.date === todayStr;
                                        const hasLog = d.log;
                                        const logStatus = hasLog?.status || (hasLog?.completed ? 'completed' : (hasLog?.missed ? 'missed' : null));
                                        const ordered = orderedDay(d);
                                        const multi = ordered.length > 1;
                                        const cur = Math.min(cellIdx[d.date] || 0, Math.max(0, ordered.length - 1));
                                        const active = ordered[cur] || null;
                                        const activeType = active?.workout_type;
                                        const typeMap = {
                                          simple: { abbr: 'Oth', color: 'bg-white/10 text-white/70' },
                                          easy: { abbr: 'Easy', color: 'bg-emerald-400/20 text-emerald-200' },
                                          rest: { abbr: 'Rest', color: 'bg-slate-400/20 text-slate-200' },
                                          tempo: { abbr: 'Tmp', color: 'bg-orange-400/20 text-orange-200' },
                                          long: { abbr: 'Long', color: 'bg-purple-400/20 text-purple-200' },
                                          intervals: { abbr: 'Int', color: 'bg-[#ec6a06]/25 text-[#ffb690]' },
                                          fartlek: { abbr: 'Fart', color: 'bg-pink-400/20 text-pink-200' },
                                          race: { abbr: 'Race', color: 'bg-[#8083ff]/30 text-[#c0c1ff]' },
                                          strength: { abbr: 'Str', color: 'bg-amber-400/20 text-amber-200' },
                                          cycling: { abbr: 'Cyc', color: 'bg-cyan-400/20 text-cyan-200' },
                                        };
                                        const typeInfo = activeType ? typeMap[activeType] : null;
                                        const isRace = activeType === 'race';
                                        return (
                                          <button
                                            key={d.date}
                                            onClick={() => openCell({ id: profile.id, full_name: profile.full_name, group_name: profile.group_name }, d)}
                                            className={`flex flex-col items-center px-1 py-2 min-h-[78px] rounded-xl text-xs transition hover:shadow-sm relative ${
                                              !inMonth ? 'opacity-40' : ''
                                            } ${isRace ? 'border-2 border-[#8083ff]/45 bg-[#8083ff]/10' :
                                               isToday ? 'border border-[#c0c1ff]/40 bg-[#c0c1ff]/10' : 'border border-white/10 bg-white/10'}`}
                                          >
                                            {isRace && (
                                              <span className="absolute top-0.5 left-0.5 text-[10px] leading-none">🏁</span>
                                            )}
                                            {multi && (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); setCellIdx((m) => ({ ...m, [d.date]: (cur + 1) % ordered.length })); }}
                                                className="absolute top-0.5 right-0.5 text-[7px] font-bold text-[#c0c1ff] bg-white/15 hover:bg-white/30 rounded px-0.5 leading-none transition"
                                                title="Switch workout"
                                              >
                                                {cur + 1}/{ordered.length}
                                              </button>
                                            )}
                                            {typeInfo && !isRace && (
                                              <span className={`text-[8px] px-1 py-px rounded font-semibold leading-none ${typeInfo.color}`}>
                                                {typeInfo.abbr}
                                              </span>
                                            )}
                                            <span className="text-[9px] font-bold text-[#c0c1ff]">
                                              {hasLog?.distance_km && hasLog.distance_km > 0 ? `${hasLog.distance_km < 10 ? hasLog.distance_km.toFixed(1) : Math.round(hasLog.distance_km)}k` : '-'}
                                            </span>
                                            <span className="font-semibold text-white">{format(dayDate, 'd')}</span>
                                            <span className="text-[10px] text-white/60">{format(dayDate, 'EEE')}</span>
                                            {logStatus && (
                                              <span className={`w-2 h-2 rounded-full mt-0.5 ${
                                                logStatus === 'completed' ? 'bg-green-400' :
                                                logStatus === 'partial' ? 'bg-yellow-400' : 'bg-red-400'
                                              }`} />
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })() : <Spinner />}
                    </>
                  )}
                </div>
              );
            })()}

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-white/50">Personal Bests</p>
                <button onClick={openPBForm} className="text-xs text-blue-300 hover:text-blue-200 hover:underline font-medium">+ Add PB</button>
              </div>
              {showPBForm && (() => {
                const inputCls = 'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-400';
                return (
                <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-lg p-3 mb-2 space-y-3">
                  <div className="flex rounded-lg border border-yellow-400/40 overflow-hidden">
                    <button onClick={() => setPbMode('manual')}
                      className={`flex-1 py-1.5 text-xs font-medium transition ${pbMode === 'manual' ? 'bg-yellow-500 text-white' : 'bg-white/5 text-white/65 hover:bg-white/10'}`}>
                      Manual Entry
                    </button>
                    <button onClick={() => setPbMode('race')}
                      className={`flex-1 py-1.5 text-xs font-medium transition ${pbMode === 'race' ? 'bg-yellow-500 text-white' : 'bg-white/5 text-white/65 hover:bg-white/10'}`}>
                      From Race
                    </button>
                  </div>

                  {pbMode === 'manual' ? (
                    <>
                      <select value={pbForm.distance_m} onChange={(e) => setPbForm({ ...pbForm, distance_m: e.target.value })}
                        className={inputCls}>
                        <option value="" className="bg-blue-950">Select distance</option>
                        <option value="1500" className="bg-blue-950">1,500m</option>
                        <option value="3000" className="bg-blue-950">3,000m</option>
                        <option value="5000" className="bg-blue-950">5,000m</option>
                        <option value="10000" className="bg-blue-950">10,000m</option>
                        <option value="21100" className="bg-blue-950">Half Marathon</option>
                        <option value="42200" className="bg-blue-950">Marathon</option>
                      </select>
                      <input placeholder="Competition name (optional)" value={pbForm.competition_name}
                        onChange={(e) => setPbForm({ ...pbForm, competition_name: e.target.value })}
                        className={inputCls} />
                    </>
                  ) : (
                    <>
                      <select onChange={(e) => handleSelectRace(e.target.value)}
                        className={inputCls}>
                        <option value="" className="bg-blue-950">Select race</option>
                        {pbRaces.map((r) => <option key={r.id} value={r.id} className="bg-blue-950">{r.name} ({r.race_date})</option>)}
                      </select>
                      {pbHeats.length > 0 && (
                        <select onChange={(e) => setPbSelectedHeat(pbHeats.find(h => h.id === parseInt(e.target.value)) || null)}
                          className={inputCls}>
                          <option value="" className="bg-blue-950">Select heat</option>
                          {pbHeats.map((h) => <option key={h.id} value={h.id} className="bg-blue-950">{h.label} ({h.distance_m}m)</option>)}
                        </select>
                      )}
                    </>
                  )}

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-white/55">Min</label>
                      <input type="number" min="0" placeholder="mm" value={pbForm.time_min}
                        onChange={(e) => setPbForm({ ...pbForm, time_min: e.target.value })}
                        className={inputCls} />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-white/55">Sec</label>
                      <input type="number" min="0" max="59" placeholder="ss" value={pbForm.time_sec}
                        onChange={(e) => setPbForm({ ...pbForm, time_sec: e.target.value })}
                        className={inputCls} />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={handleSavePB} disabled={pbSaving}
                      className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50 transition">
                      {pbSaving ? 'Saving...' : 'Save PB'}
                    </button>
                    <button onClick={() => setShowPBForm(false)}
                      className="flex-1 bg-white/10 hover:bg-white/15 border border-white/20 text-white/80 rounded-lg py-2 text-sm font-medium transition">
                      Cancel
                    </button>
                  </div>
                </div>
                );
              })()}
              {profile.personal_bests?.length > 0 ? (
                <div className="space-y-1.5">
                  {profile.personal_bests.map((pb) => (
                    <div key={pb.distance_m} className="flex items-center justify-between bg-yellow-500/15 border border-yellow-400/30 rounded-lg px-3 py-2 text-sm">
                      <span className="font-semibold text-yellow-200">{pb.distance_display}</span>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <span className="font-bold text-yellow-100">{pb.time_display}</span>
                          {pb.race_name && <span className="text-xs text-white/55 ml-2">{pb.race_name}</span>}
                        </div>
                        {pb.result_id && (
                          <div className="flex gap-1">
                            <button onClick={() => openEditResult(pb)} className="text-xs text-blue-300 hover:text-blue-200 hover:underline">Edit</button>
                            <button onClick={() => handleDeleteResult(pb)} className="text-xs text-red-300 hover:text-red-200 hover:underline">×</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : !showPBForm && (
                <p className="text-xs text-white/40 text-center py-2">No personal bests yet</p>
              )}
            </div>

            {profile.race_history?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-white/50 mb-2">Race History</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {profile.race_history.map((r, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white truncate">{r.race_name || (r.is_manual ? '—' : 'Race')}</p>
                        <p className="text-xs text-white/55">{format(new Date(r.race_date + 'T00:00'), 'MMM d, yyyy')} · {r.distance_display}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white/85">{r.time_display}</span>
                        {r.is_manual && r.result_id && (
                          <div className="flex gap-1">
                            <button onClick={() => openEditResult(r)} className="text-xs text-blue-300 hover:text-blue-200 hover:underline">Edit</button>
                            <button onClick={() => handleDeleteResult(r)} className="text-xs text-red-300 hover:text-red-200 hover:underline">×</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profile.recent_logs?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-white/50 mb-2">Recent Activity</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {profile.recent_logs.map((log) => (
                    <div key={log.date} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm border ${log.completed ? 'bg-green-500/15 border-green-400/30' : 'bg-red-500/15 border-red-400/30'}`}>
                      <span className="text-white/80">{format(new Date(log.date + 'T00:00'), 'EEE, MMM d')}</span>
                      <div className="flex items-center gap-2">
                        {log.notes && <span className="text-xs text-white/55 truncate max-w-[120px]">{log.notes}</span>}
                        <span className={`font-medium ${log.completed ? 'text-green-200' : 'text-red-200'}`}>
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

      <Modal open={!!selected} onClose={closeSelected}
        title={selected ? (showTargetForm ? (editingTargetId ? 'Edit workout' : 'Add workout') : format(new Date(selected.day.date + 'T00:00'), 'EEEE, MMM d')) : ''}
        panelClassName="bg-gradient-to-b from-blue-950 to-indigo-950 border-t border-white/10">
        {selected && (
          <div className="space-y-4">
            {showTargetForm ? (
              /* ── Form card (replaces day view when adding/editing) ── */
              <div className="space-y-3">
                <button
                  onClick={() => { seedForm(null); setShowTargetForm(false); }}
                  className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition mb-1"
                >
                  ← Back
                </button>
                <p className="text-xs text-white/50">{selected.athlete.full_name}</p>
                {(() => {
                  const meta = typeMetaFor(personalForm.workout_type);
                  const setF = (k, v) => setPersonalForm(f => ({ ...f, [k]: v }));
                  const selectType = (value) => setPersonalForm(f => {
                    const wasDefault = !f.title.trim() || DEFAULT_TITLES.has(f.title.trim());
                    const nextTitle = wasDefault ? (value === 'simple' ? '' : typeMetaFor(value).label) : f.title;
                    return { ...f, workout_type: value, title: nextTitle };
                  });
                  const hasAny = (meta.structured
                    ? (personalForm.warmup.trim() || personalForm.main_session.trim() || personalForm.cooldown.trim() || personalForm.title.trim())
                    : ((personalForm.content || '').trim() || personalForm.title.trim()))
                    || (personalForm.note || '').trim();
                  const inputCls = 'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400';
                  return (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        {WORKOUT_TYPES.map(t => (
                          <button key={t.value} onClick={() => selectType(t.value)}
                            className={`text-xs px-2 py-1 rounded-lg font-medium border transition ${
                              personalForm.workout_type === t.value
                                ? `${t.color} border-current`
                                : 'bg-white/5 text-white/60 border-white/15 hover:bg-white/15'
                            }`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <input type="text" value={personalForm.title}
                        onChange={(e) => setF('title', e.target.value)}
                        placeholder="Title (shown on calendar)"
                        className={inputCls} />

                      {tracksDistance(personalForm.workout_type) && (
                        <input type="number" inputMode="decimal" value={personalForm.distance_km}
                          onChange={(e) => setF('distance_km', e.target.value)}
                          placeholder="Distance (km)"
                          className={inputCls} />
                      )}

                      {meta.structured ? (
                        <>
                          <textarea value={personalForm.warmup} onChange={(e) => setF('warmup', e.target.value)}
                            placeholder="Warm-up" rows={1}
                            className={inputCls} />
                          <textarea value={personalForm.main_session} onChange={(e) => setF('main_session', e.target.value)}
                            placeholder={meta.mainLabel || 'Main session'} rows={2}
                            className={inputCls} />
                          <textarea value={personalForm.cooldown} onChange={(e) => setF('cooldown', e.target.value)}
                            placeholder="Cool-down" rows={1}
                            className={inputCls} />
                        </>
                      ) : (
                        <textarea value={personalForm.content} onChange={(e) => setF('content', e.target.value)}
                          placeholder="Workout (what to do)…" rows={2}
                          className={inputCls} />
                      )}

                      <textarea value={personalForm.note} onChange={(e) => setF('note', e.target.value)}
                        placeholder="Note for the athlete (optional)…" rows={2}
                        className={inputCls} />

                      {hasAny && (
                        <>
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" checked={additional} onChange={(e) => setAdditional(e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-blue-500" />
                            <span className="text-xs text-white/75">Show in addition to group workout
                              <span className="block text-[11px] text-white/45">Athlete sees this even when a group workout exists. If unchecked, a group workout that day replaces it.</span>
                            </span>
                          </label>
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-blue-500" />
                            <span className="text-xs text-white/75">Hide from athlete
                              <span className="block text-[11px] text-white/45">They won't see it until you share. You (and the group's coaches) still see it in gray.</span>
                            </span>
                          </label>
                        </>
                      )}

                      <div className="flex gap-2 mt-3">
                        <button onClick={() => handleSavePersonal()} disabled={saving}
                          className="flex-1 bg-blue-500 hover:bg-blue-400 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 transition">
                          {saving ? 'Saving...' : editingTargetId ? (hidden ? 'Update (hidden)' : 'Update') : (hidden ? 'Add (hidden)' : 'Add')}
                        </button>
                        <button onClick={() => { seedForm(null); setShowTargetForm(false); }}
                          className="flex-1 border border-white/25 text-white/75 hover:text-white hover:bg-white/10 rounded-lg py-2.5 text-sm font-medium transition">
                          Cancel
                        </button>
                      </div>
                      {hidden && (
                        <button onClick={() => handleSavePersonal(false)} disabled={saving}
                          className="w-full mt-2 border border-blue-400/50 text-blue-200 rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-400/10 disabled:opacity-50 transition">
                          Share with athlete now
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
            /* ── Day view ── */
            <><p className="text-xs text-white/60 -mt-2">{selected.athlete.full_name}</p>
            {/* Workouts — everything the athlete has this day (group + personal),
                each labelled. "No workout today" when there's genuinely nothing. */}
            <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-white/50 mb-2">Workouts</p>
              {(() => {
                const gw = selected.day.group_workout;
                // Hidden (coach-only draft) workouts sink to the bottom of the list;
                // stable sort keeps the saved order within each group.
                const targets = [...(selected.day.targets || [])].sort((a, b) => (a.hidden ? 1 : 0) - (b.hidden ? 1 : 0));
                if (!gw && targets.length === 0) {
                  return <p className="text-sm text-white/40 italic">No workout today</p>;
                }
                const TYPE_LABELS = { simple: 'Other', easy: 'Easy run', rest: 'Rest day', tempo: 'Tempo', long: 'Long run', intervals: 'Intervals', fartlek: 'Fartlek', race: 'Race', strength: 'Strength', cycling: 'Cycling' };
                const structured = (ty) => ['tempo', 'long', 'intervals', 'fartlek', 'race'].includes(ty);
                const gwHidden = !!selected.day.hide_group;
                const gwCard = gw && (() => {
                  const gwIsRace = gw.workout_type === 'race';
                  const middleLabel = gwIsRace ? 'Race' : 'Main';
                  return (
                    <div className={`rounded-lg border p-2.5 ${gwHidden ? 'border-dashed border-white/20 bg-white/[0.03] opacity-60' : gwIsRace ? 'border-indigo-400/50 bg-indigo-400/15' : 'border-white/10 bg-white/[0.05]'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-indigo-400/25 text-indigo-100">Group</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-white/10 text-white/70">{TYPE_LABELS[gw.workout_type] || 'Other'}</span>
                          {gwHidden && <span className="text-[10px] text-white/40">🙈 hidden</span>}
                        </div>
                        <button
                          onClick={toggleGroupHide}
                          disabled={saving}
                          className={`shrink-0 text-[11px] px-2 py-1 rounded border disabled:opacity-50 ${gwHidden ? 'border-green-400/40 text-green-300 hover:bg-green-500/15' : 'border-white/25 text-white/50 hover:bg-white/10'}`}
                          title={gwHidden ? 'Show group workout to athlete' : 'Hide group workout from athlete'}
                        >{gwHidden ? 'Show' : 'Hide'}</button>
                      </div>
                      {(gw.title || gwIsRace) && (
                        <p className="text-sm font-semibold text-white mt-0.5">{gwIsRace && '🏁 '}{gw.title || 'Race day'}
                          {gw.distance_km > 0 && <span className="text-white/45 font-normal"> · {Number(gw.distance_km).toFixed(1)} km</span>}
                        </p>
                      )}
                      {structured(gw.workout_type) ? (
                        <div className="text-xs text-white/80 space-y-0.5 mt-1">
                          {gw.warmup && <p><span className="text-[10px] uppercase tracking-wider text-white/40">WU · </span><span className="whitespace-pre-wrap">{gw.warmup}</span></p>}
                          {gw.main_session && <p><span className="text-[10px] uppercase tracking-wider text-white/40">{middleLabel} · </span><span className="whitespace-pre-wrap">{gw.main_session}</span></p>}
                          {gw.cooldown && <p><span className="text-[10px] uppercase tracking-wider text-white/40">CD · </span><span className="whitespace-pre-wrap">{gw.cooldown}</span></p>}
                        </div>
                      ) : (
                        gw.content && <p className="text-xs text-white/80 whitespace-pre-wrap mt-1">{gw.content}</p>
                      )}
                    </div>
                  );
                })();
                return (
                  <div className="space-y-2">
                    {/* Group workout shown first unless hidden — then it sinks below personal workouts */}
                    {!gwHidden && gwCard}
                    {targets.map((t, idx) => {
                      const tm = typeMetaFor(t.workout_type);
                      const isMain = idx === 0;
                      return (
                        <div key={t.id} className={`rounded-lg border p-2.5 flex items-start justify-between gap-2 ${t.hidden ? 'border-dashed border-white/15 bg-white/[0.015] opacity-60' : 'border-white/10 bg-white/[0.05]'}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-blue-400/25 text-blue-100">Personal</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${tm.color}`}>{tm.label}</span>
                              {isMain && !t.hidden && targets.length > 1 && <span className="text-[9px] text-yellow-300 font-semibold">★ main</span>}
                              {t.hidden && <span className="text-[10px] text-white/40">🙈 hidden</span>}
                              {t.additional && <span className="text-[10px] text-blue-200">+ with group</span>}
                            </div>
                            {(t.title || t.workout_type === 'race') && (
                              <p className="text-sm font-semibold text-white mt-0.5">{t.workout_type === 'race' && '🏁 '}{t.title || tm.label}
                                {t.distance_km > 0 && <span className="text-white/45 font-normal"> · {Number(t.distance_km).toFixed(1)} km</span>}
                              </p>
                            )}
                            {tm.structured ? (
                              <div className="text-xs text-white/75 space-y-0.5 mt-1">
                                {t.warmup && <p><span className="text-[10px] uppercase tracking-wider text-white/40">WU · </span><span className="whitespace-pre-wrap">{t.warmup}</span></p>}
                                {t.main_session && <p><span className="text-[10px] uppercase tracking-wider text-white/40">{tm.mainLabel || 'Main'} · </span><span className="whitespace-pre-wrap">{t.main_session}</span></p>}
                                {t.cooldown && <p><span className="text-[10px] uppercase tracking-wider text-white/40">CD · </span><span className="whitespace-pre-wrap">{t.cooldown}</span></p>}
                              </div>
                            ) : (
                              t.content && <p className="text-xs text-white/75 whitespace-pre-wrap mt-1">{t.content}</p>
                            )}
                            {t.note && <p className="text-[11px] text-white/50 italic mt-1">Note: {t.note}</p>}
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <button onClick={() => openTargetForm(t)} disabled={saving}
                              className="text-[11px] px-2 py-1 rounded border border-[#c0c1ff]/40 text-[#c0c1ff] hover:bg-[#c0c1ff]/10 disabled:opacity-50">Edit</button>
                            {!isMain && !t.hidden && (
                              <button
                                onClick={async () => { setSaving(true); try { await promoteTarget(t.id); await refreshSelectedDay(); fetchData(); } finally { setSaving(false); } }}
                                disabled={saving}
                                className="text-[11px] px-2 py-1 rounded border border-yellow-400/40 text-yellow-300 hover:bg-yellow-500/15 disabled:opacity-50"
                                title="Set as main workout (shown first in calendar)"
                              >★ Main</button>
                            )}
                            <button
                              onClick={async () => { setSaving(true); try { await updateTargetById(t.id, { hidden: !t.hidden }); await refreshSelectedDay(); fetchData(); } finally { setSaving(false); } }}
                              disabled={saving}
                              className={`text-[11px] px-2 py-1 rounded border disabled:opacity-50 ${t.hidden ? 'border-green-400/40 text-green-300 hover:bg-green-500/15' : 'border-white/25 text-white/50 hover:bg-white/10'}`}
                              title={t.hidden ? 'Share with athlete' : 'Hide from athlete'}
                            >{t.hidden ? 'Show' : 'Hide'}</button>
                            <button onClick={() => deleteTargetRow(t)} disabled={saving}
                              className="text-[11px] px-2 py-1 rounded border border-red-400/30 text-red-300 hover:bg-red-500/15 disabled:opacity-50">Delete</button>
                          </div>
                        </div>
                      );
                    })}
                    {/* Hidden group workout sinks to the bottom */}
                    {gwHidden && gwCard}
                  </div>
                );
              })()}
            </div>

            {/* Athlete report section */}
            <div className={`rounded-lg p-3 border ${selected.day.log ? (
              (selected.day.log.status || (selected.day.log.completed ? 'completed' : 'missed')) === 'completed' ? 'bg-green-500/15 border-green-400/30' :
              (selected.day.log.status || (selected.day.log.completed ? 'completed' : 'missed')) === 'partial' ? 'bg-yellow-500/15 border-yellow-400/30' : 'bg-red-500/15 border-red-400/30'
            ) : 'bg-white/10 border-white/15'}`}>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-white/50 mb-1.5">Athlete Report</p>
              {selected.day.log ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{
                      (selected.day.log.status || (selected.day.log.completed ? 'completed' : 'missed')) === 'completed' ? 'Completed' :
                      (selected.day.log.status || (selected.day.log.completed ? 'completed' : 'missed')) === 'partial' ? 'Half Completed' : 'Missed'
                    }</p>
                    <span className="text-sm font-bold text-blue-200">
                      {selected.day.log.distance_km > 0 ? `${selected.day.log.distance_km.toFixed(1)} km` : '— km'}
                    </span>
                  </div>
                  {selected.day.log.notes && <p className="text-sm text-white/75 mt-1 whitespace-pre-wrap">{selected.day.log.notes}</p>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {selected.day.log.id && (() => {
                      const REACTIONS = [
                        { key: 'clap', icon: '👏', activeBg: 'bg-pink-400/25', activeText: 'text-pink-200', activeBorder: 'border-pink-400/40', hoverBg: 'hover:bg-white/15' },
                        { key: 'heart', icon: '❤️', activeBg: 'bg-red-400/25', activeText: 'text-red-200', activeBorder: 'border-red-400/40', hoverBg: 'hover:bg-white/15' },
                        { key: 'dislike', icon: '👎', activeBg: 'bg-white/20', activeText: 'text-white', activeBorder: 'border-white/40', hoverBg: 'hover:bg-white/15' },
                        { key: 'unlike', icon: '💔', activeBg: 'bg-purple-400/25', activeText: 'text-purple-200', activeBorder: 'border-purple-400/40', hoverBg: 'hover:bg-white/15' },
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
                              reacted ? `${activeBg} ${activeText} ${activeBorder}` : `bg-white/5 text-white/55 border-white/15 ${hoverBg}`
                            }`}
                          >
                            <span>{icon}</span>
                            {count > 0 && <span>{count}</span>}
                          </button>
                        );
                      });
                    })()}
                  </div>
                  {(stravaLoading || (stravaActivities && stravaActivities.length > 0)) && (
                    <div className="mt-3 pt-3 border-t border-white/15">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-300 mb-1.5">
                        🏃 Strava activities
                      </p>
                      {stravaLoading ? (
                        <p className="text-xs text-white/40 italic">Loading…</p>
                      ) : (
                        <div className="space-y-1.5">
                          {stravaActivities.map(a => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setSelectedStravaActivity(a)}
                              className="w-full text-left hover:brightness-125 active:scale-[0.99] transition"
                            >
                              <StravaActivityRow activity={a} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-white/40 italic">No report submitted</p>
              )}
            </div>

            {/* Comments on the athlete's report */}
            {selected.day.log?.id && (
              <WorkoutCommentThread workoutLogId={selected.day.log.id} />
            )}

            {/* Bottom controls: hide-group toggle + add workout button */}
            <div className="border-t border-white/15 pt-4 space-y-3">
              <div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={pendingHide} disabled={saving} onChange={(e) => setPendingHide(e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-blue-500" />
                  <span className="text-xs text-white/75">Don’t show group workout today
                    <span className="block text-[11px] text-white/45">{selected.day.group_workout
                      ? "Hides this group workout from the athlete for this day and drops it from their planned km."
                      : "The athlete won’t see any group workout added for this day (and it won’t count toward their km)."}</span>
                  </span>
                </label>
                {pendingHide !== !!selected.day.hide_group && (
                  <button onClick={applyGroupHide} disabled={saving}
                    className="mt-2 w-full bg-blue-500 hover:bg-blue-400 text-white rounded-lg py-2 text-xs font-semibold disabled:opacity-50 transition">
                    {saving ? "Applying…" : "Apply"}
                  </button>
                )}
              </div>
              <button onClick={() => openTargetForm(null)}
                className="w-full border border-[#c0c1ff]/40 text-[#c0c1ff] rounded-xl py-2.5 text-sm font-bold hover:bg-[#c0c1ff]/10">
                + Add workout
              </button>
            </div>
            </>)}
          </div>
        )}
      </Modal>

      {/* Expanded month view */}
      <Modal
        open={monthExpanded}
        onClose={() => setMonthExpanded(false)}
        title="Training log"
        fullScreen
        panelClassName="bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950"
      >
        {profileMonth && profile && (
          <div>
            <p className="text-xs text-white/60 -mt-2 mb-3">{profile.full_name}</p>

            {/* Zoom controls */}
            <div className="flex items-center justify-end gap-2 mb-2">
              <span className="text-xs text-white/60">Zoom</span>
              <button
                onClick={() => setExpandedZoom(z => Math.max(0.3, +(z - 0.05).toFixed(2)))}
                disabled={expandedZoom <= 0.3}
                className="w-7 h-7 rounded border border-white/20 bg-white/5 text-white text-sm font-bold hover:bg-white/15 disabled:opacity-30 transition"
              >−</button>
              <span className="text-xs font-mono w-10 text-center text-white/85">{Math.round(expandedZoom * 100)}%</span>
              <button
                onClick={() => setExpandedZoom(z => Math.min(1.8, +(z + 0.05).toFixed(2)))}
                disabled={expandedZoom >= 1.8}
                className="w-7 h-7 rounded border border-white/20 bg-white/5 text-white text-sm font-bold hover:bg-white/15 disabled:opacity-30 transition"
              >+</button>
              <button
                onClick={() => setExpandedZoom(1)}
                className="text-xs text-blue-300 hover:text-blue-200 hover:underline ml-1 transition"
              >Reset</button>
            </div>

            {/* Month + year navigation at the top */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setProfileMonthDate(subMonths(profileMonthDate, 1))}
                className="text-blue-300 hover:text-blue-200 text-sm transition"
              >&larr; Prev</button>
              <YearMonthLabel
                currentDate={profileMonthDate}
                onYearChange={(y) => setProfileMonthDate(new Date(y, profileMonthDate.getMonth(), 1))}
                className="text-sm font-semibold text-white"
              />
              <button
                onClick={() => setProfileMonthDate(addMonths(profileMonthDate, 1))}
                className="text-blue-300 hover:text-blue-200 text-sm transition"
              >Next &rarr;</button>
            </div>

          <div
            ref={expandedScrollRef}
            className="overflow-x-auto -mx-2"
            style={{ touchAction: 'pan-x pan-y' }}
          >
            <div className="px-2" style={{ minWidth: '960px', zoom: expandedZoom }}>
              <div className="grid gap-1 mb-1 text-xs text-white/60 text-center font-medium" style={{ gridTemplateColumns: 'repeat(7, 1fr) 120px' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <div key={i}>{d}</div>)}
                <div className="text-right pr-1">Week</div>
              </div>
              <div className="space-y-1">
                {profileMonth.weeks.map((week, wi) => {
                  // Week totals are full Sunday–Saturday — do NOT clamp to the
                  // current month, or a month-boundary week gets split in two.
                  let wkKm = 0, wkExp = 0, wkDone = 0, wkPart = 0, wkMiss = 0;
                  for (const d of week) {
                    wkExp += plannedKm(d);
                    if (!d.log) continue;
                    if (d.log.distance_km) wkKm += d.log.distance_km;
                    const st = d.log.status || (d.log.completed ? 'completed' : 'missed');
                    if (st === 'completed') wkDone++;
                    else if (st === 'partial') wkPart++;
                    else wkMiss++;
                  }
                  return (
                  <div key={wi} className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, 1fr) 120px' }}>
                    {week.map(d => {
                      const dayDate = new Date(d.date + 'T00:00');
                      const inMonth = isSameMonth(dayDate, profileMonthDate);
                      const status = d.log ? (d.log.status || (d.log.completed ? 'completed' : 'missed')) : null;
                      const cellHeight = 195;
                      const allWorkouts = visibleDayWorkouts(d);
                      const multi = allWorkouts.length > 1;
                      const idx = Math.min(cellIdx[d.date] || 0, Math.max(0, allWorkouts.length - 1));
                      const active = allWorkouts[idx] || null;
                      const personalOverride = active?._source === 'personal';
                      const targetHidden = personalOverride && !!active?.hidden;
                      const bg = !inMonth ? 'bg-white/5 border-white/10 hover:bg-white/10 opacity-60' :
                        targetHidden ? 'bg-white/[0.06] border-dashed border-white/25 hover:bg-white/10' :
                        status === 'completed' ? 'bg-green-500/40 border-green-400/50 hover:bg-green-500/50' :
                        status === 'partial' ? 'bg-yellow-500/35 border-yellow-400/45 hover:bg-yellow-500/45' :
                        status === 'missed' ? 'bg-red-500/35 border-red-400/45 hover:bg-red-500/45' :
                        'bg-white/20 border-white/30 hover:bg-white/30';
                      const workoutTitle = active?.title || (personalOverride ? 'Personal' : '');
                      const workoutBody = active?.content || active?.main_session || active?.warmup || '';
                      const hasPersonal = allWorkouts.some((w) => w._source === 'personal');
                      const TYPE_FULL = {
                        simple:    { label: 'Other',     color: 'bg-white/10 text-white/70' },
                        easy:      { label: 'Easy',      color: 'bg-emerald-400/20 text-emerald-200' },
                        rest:      { label: 'Rest day',  color: 'bg-slate-400/20 text-slate-200' },
                        tempo:     { label: 'Tempo',     color: 'bg-orange-400/20 text-orange-200' },
                        long:      { label: 'Long run',  color: 'bg-purple-400/20 text-purple-200' },
                        intervals: { label: 'Intervals', color: 'bg-[#ec6a06]/25 text-[#ffb690]' },
                        fartlek:   { label: 'Fartlek',   color: 'bg-pink-400/20 text-pink-200' },
                        race:      { label: 'Race',      color: 'bg-[#8083ff]/30 text-[#c0c1ff]' },
                        strength:  { label: 'Strength',  color: 'bg-amber-400/20 text-amber-200' },
                        cycling:   { label: 'Cycling',   color: 'bg-cyan-400/20 text-cyan-200' },
                      };
                      const typeChip = active?.workout_type ? TYPE_FULL[active.workout_type] : null;
                      const cellIsRace = active?.workout_type === 'race';
                      const kmParts = allWorkouts.map((w) => w.distance_km || 0).filter((k) => k > 0);
                      const totalKm = kmParts.reduce((a, b) => a + b, 0);
                      return (
                        <button
                          key={d.date}
                          onClick={() => { setMonthExpanded(false); openCell({ id: profile.id, full_name: profile.full_name, group_name: profile.group_name }, d, true); }}
                          className={`rounded-lg ${cellIsRace ? 'border-2 border-indigo-500' : 'border'} ${bg} relative flex flex-col text-left transition overflow-hidden`}
                          style={{ minHeight: `${cellHeight}px` }}
                        >
                          {/* Date row + type chip */}
                          <div className="flex items-start justify-between px-2 pt-1.5">
                            <span className="flex items-center gap-1">
                              <span className="text-[11px] text-white/75 font-semibold leading-none">{format(dayDate, 'd')}{targetHidden && ' 🙈'}</span>
                              {multi && (
                                <button
                                  className="text-[9px] text-[#c0c1ff] font-bold leading-none flex items-center px-1 py-px rounded bg-white/10 hover:bg-white/25 transition"
                                  onClick={(e) => { e.stopPropagation(); setCellIdx((m) => ({ ...m, [d.date]: ((m[d.date] || 0) + 1) % allWorkouts.length })); }}
                                  title="Switch workout"
                                >
                                  {idx + 1}/{allWorkouts.length}
                                </button>
                              )}
                            </span>
                            {typeChip && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none ${typeChip.color}`}>
                                {typeChip.label}
                              </span>
                            )}
                          </div>

                          {/* Top half: planned workout */}
                          <div className="flex-1 px-2 py-1 min-h-0 flex flex-col">
                            {workoutTitle ? (
                              <p className={`text-xs font-semibold leading-tight line-clamp-2 ${personalOverride ? 'text-blue-200' : 'text-white'} [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]`}>
                                {cellIsRace && '🏁 '}{workoutTitle}
                              </p>
                            ) : cellIsRace ? (
                              <p className="text-xs font-semibold leading-tight text-indigo-200">🏁 Race</p>
                            ) : null}
                            {workoutBody && (
                              <p className="text-[10px] text-white/65 leading-tight line-clamp-2 mt-0.5 whitespace-pre-wrap">
                                {workoutBody}
                              </p>
                            )}
                            {totalKm > 0 && (
                              <div className={`flex items-end mt-auto ${multi && (active?.distance_km || 0) > 0 ? 'justify-between' : 'justify-end'}`}>
                                {multi && (active?.distance_km || 0) > 0 && (
                                  <span className="text-[10px] text-white/50 font-semibold leading-none">{fmtKm(active.distance_km)} km</span>
                                )}
                                <span className="text-[11px] font-bold leading-none text-white">{fmtKm(totalKm)} km</span>
                              </div>
                            )}
                          </div>

                          {/* Divider */}
                          <div className="border-t border-dashed border-white/25 mx-1" />

                          {/* Bottom half: athlete report */}
                          <div className="flex-1 flex flex-col px-2 py-1 min-h-0">
                            {d.log ? (
                              <>
                                {d.log.notes ? (
                                  <p className="text-[10px] text-white/80 leading-tight line-clamp-2 whitespace-pre-wrap flex-1">
                                    {d.log.notes}
                                  </p>
                                ) : !d.log.distance_km ? (
                                  <p className="text-[10px] text-white/40 italic flex-1">No report</p>
                                ) : <div className="flex-1" />}
                                {d.log.distance_km > 0 && (
                                  <p className="text-xs text-[#c0c1ff] font-bold leading-none mt-1 self-end">{d.log.distance_km.toFixed(1)} km</p>
                                )}
                              </>
                            ) : (
                              <p className="text-[10px] text-white/40 italic">No report</p>
                            )}
                          </div>

                          {hasPersonal && !personalOverride && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" />}
                        </button>
                      );
                    })}
                    {/* Week stats column */}
                    <div className="flex flex-col items-end justify-center text-right px-1 text-xs">
                      <div className="font-bold text-blue-200">{wkKm > 0 ? `${wkKm.toFixed(1)}k` : '—'}</div>
                      <div className="flex gap-1.5 mt-1 text-[11px] font-mono">
                        <span className="text-green-300">V{wkDone}</span>
                        <span className="text-yellow-300">~{wkPart}</span>
                        <span className="text-red-300">X{wkMiss}</span>
                      </div>
                      {wkExp > 0 && <div className="text-[10px] text-white font-semibold mt-1">exp {fmtKm(wkExp)}k</div>}
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Month totals */}
              {(() => {
                let mKm = 0, mDone = 0, mPart = 0, mMiss = 0;
                for (const week of profileMonth.weeks) {
                  for (const d of week) {
                    if (!isSameMonth(new Date(d.date + 'T00:00'), profileMonthDate)) continue;
                    if (!d.log) continue;
                    if (d.log.distance_km) mKm += d.log.distance_km;
                    const st = d.log.status || (d.log.completed ? 'completed' : 'missed');
                    if (st === 'completed') mDone++;
                    else if (st === 'partial') mPart++;
                    else mMiss++;
                  }
                }
                return (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/15">
                    <span className="text-sm font-semibold text-white/85">{format(profileMonthDate, 'MMMM')} totals</span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-bold text-blue-200">{mKm.toFixed(1)} km</span>
                      <div className="flex gap-2 text-xs font-mono">
                        <span className="text-green-300">V{mDone}</span>
                        <span className="text-yellow-300">~{mPart}</span>
                        <span className="text-red-300">X{mMiss}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
          </div>
        )}
      </Modal>

      {/* Edit PB / manual result modal */}
      <Modal open={!!editingResult} onClose={() => setEditingResult(null)}
        title={editingResult ? `Edit ${editingResult.distance_display || editingResult.distance_m + 'm'}` : 'Edit result'}>
        {editingResult && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1">Time</p>
              <div className="flex gap-2 items-center">
                <input type="number" min="0" value={editResultMin}
                  onChange={(e) => setEditResultMin(e.target.value)}
                  placeholder="mm" className="w-20 border rounded-lg px-3 py-2 text-sm" />
                <span className="text-gray-400">:</span>
                <input type="number" min="0" max="59" value={editResultSec}
                  onChange={(e) => setEditResultSec(e.target.value)}
                  placeholder="ss" className="w-20 border rounded-lg px-3 py-2 text-sm" />
                <span className="text-xs text-gray-500">min:sec</span>
              </div>
            </div>
            {editingResult.is_manual && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Competition name (optional)</p>
                <input type="text" value={editResultName}
                  onChange={(e) => setEditResultName(e.target.value)}
                  placeholder="e.g. Tel Aviv Half"
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={handleSaveEditResult} disabled={editResultSaving}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {editResultSaving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditingResult(null)}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      {selectedStravaActivity && selected && (
        <StravaActivityDetail
          activityId={selectedStravaActivity.id}
          athleteId={selected.athlete.id}
          onClose={() => setSelectedStravaActivity(null)}
        />
      )}
    </div>
  );
}

function StravaActivityRow({ activity }) {
  const km = (activity.distance_m / 1000).toFixed(2);
  const mins = Math.floor(activity.moving_time_s / 60);
  const secs = String(activity.moving_time_s % 60).padStart(2, '0');
  return (
    <div className="flex items-center gap-2 text-xs bg-orange-400/15 border border-orange-400/25 rounded-lg px-2.5 py-1.5">
      <span className="font-semibold text-orange-200 truncate flex-1">{activity.name}</span>
      <span className="bg-orange-400/20 text-orange-300 px-1.5 py-0.5 rounded font-medium shrink-0">{activity.type}</span>
      <span className="text-white/70 font-mono shrink-0">{km} km</span>
      <span className="text-white/50 font-mono shrink-0">{mins}:{secs}</span>
    </div>
  );
}

function YearMonthLabel({ currentDate, onYearChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const currentYear = currentDate.getFullYear();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 13 }, (_, i) => thisYear - 8 + i);

  return (
    <div className="relative" ref={ref}>
      <h2 className={className}>
        {format(currentDate, 'MMMM')}{' '}
        <button
          onClick={() => setOpen((v) => !v)}
          className="hover:underline focus:outline-none focus:underline transition"
          title="Switch year"
        >
          {format(currentDate, 'yyyy')}
        </button>
      </h2>
      {open && (
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-50 bg-blue-950 border border-white/20 rounded-lg shadow-2xl py-1 w-24 max-h-72 overflow-y-auto">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => { onYearChange(y); setOpen(false); }}
              className={`block w-full px-3 py-1.5 text-sm text-center transition ${
                y === currentYear
                  ? 'bg-blue-500 text-white font-semibold'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
