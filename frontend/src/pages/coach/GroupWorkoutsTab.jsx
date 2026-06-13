import { useState, useEffect, useRef } from 'react';
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, subWeeks, addWeeks, subMonths, addMonths, isSameMonth } from 'date-fns';
import { getCoachGroupWeek, createGroupWorkout, updateGroupWorkoutById, deleteGroupWorkoutById } from '../../api/calendar';
import { getGroup, listAthletes } from '../../api/coach';
import Modal from '../../components/ui/Modal';
import { NoiseBackground } from '../../components/ui/NoiseBackground';
import Spinner from '../../components/ui/Spinner';

const WORKOUT_TYPES = [
  { value: 'simple',    label: 'Other',     abbr: 'Oth',  color: 'bg-gray-100 text-gray-700',       structured: false },
  { value: 'easy',      label: 'Easy run',  abbr: 'Easy', color: 'bg-emerald-100 text-emerald-700', structured: false },
  { value: 'rest',      label: 'Rest day',  abbr: 'Rest', color: 'bg-slate-100 text-slate-700',     structured: false },
  { value: 'tempo',     label: 'Tempo',     abbr: 'Tem',  color: 'bg-orange-100 text-orange-700',   structured: true },
  { value: 'long',      label: 'Long run',  abbr: 'Long', color: 'bg-purple-100 text-purple-700',   structured: true },
  { value: 'intervals', label: 'Intervals', abbr: 'Int',  color: 'bg-red-100 text-red-700',         structured: true },
  { value: 'fartlek',   label: 'Fartlek',   abbr: 'Fart', color: 'bg-pink-100 text-pink-700',       structured: true },
  { value: 'race',      label: 'Race',      abbr: 'Race', color: 'bg-indigo-100 text-indigo-700',   structured: true, mainLabel: 'Race' },
];

const typeMeta = (t) => WORKOUT_TYPES.find(x => x.value === t) || WORKOUT_TYPES[0];

const workoutSnippet = (gw) => {
  if (!gw) return '';
  if (gw.title) return gw.title;
  return gw.content || gw.main_session || gw.warmup || '';
};

export default function GroupWorkoutsTab({ group }) {
  const [groupDetail, setGroupDetail] = useState(null);
  const [allAthletes, setAllAthletes] = useState([]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('weekly');
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  // editingId: null → list view; 'new' → creating; number → editing that workout
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    workout_type: 'simple',
    title: '',
    content: '',
    warmup: '',
    main_session: '',
    cooldown: '',
    draft_content: '',
  });
  const [selectedRecipientIds, setSelectedRecipientIds] = useState([]);
  // Snapshot of recipient_ids at the moment we opened the edit form. Used so
  // (a) the "overridden by newer workout" indicator only fires for athletes
  //     who were already in the list (legacy data), not ones the coach just
  //     re-added in this session, and
  // (b) the save-cleanup only removes athletes from other workouts when
  //     they were newly added during this edit.
  const [initialRecipientIds, setInitialRecipientIds] = useState([]);
  // override-confirm panel: null | 'confirm' (yes/no/pick) | 'pick' (per-athlete checkboxes)
  const [overrideMode, setOverrideMode] = useState(null);
  const [overridePickIds, setOverridePickIds] = useState([]);
  // Single-athlete transfer prompt: { athleteName, fromLabels, onConfirm } or null
  const [transferPrompt, setTransferPrompt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [expandedZoom, setExpandedZoom] = useState(0.75);
  const expandedScrollRef = useRef(null);
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

  const fetchGroupDetail = async () => {
    if (!group) return;
    try {
      const [detail, athletes] = await Promise.all([getGroup(group.id), listAthletes()]);
      setGroupDetail(detail.data);
      setAllAthletes(athletes.data);
    } catch (err) { console.error(err); }
  };

  const fetchData = async () => {
    if (!group) { setDays([]); return; }
    setLoading(true);
    try {
      if (view === 'weekly') {
        const { data } = await getCoachGroupWeek(group.id, format(currentDate, 'yyyy-MM-dd'));
        setDays(data.days);
      } else {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        const calEnd = startOfWeek(monthEnd, { weekStartsOn: 0 });
        const weeks = [];
        let ws = calStart;
        while (ws <= calEnd) {
          weeks.push(getCoachGroupWeek(group.id, format(ws, 'yyyy-MM-dd')));
          ws = addDays(ws, 7);
        }
        const results = await Promise.all(weeks);
        setDays(results.flatMap(r => r.data.days));
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Re-fetch a single day's workouts without disturbing the rest of the grid —
  // used after save/delete inside the modal so the "list view" updates live.
  const refetchDay = async (date) => {
    if (!group) return null;
    const { data } = await getCoachGroupWeek(group.id, date);
    const updated = data.days.find(d => d.date === date);
    if (!updated) return null;
    setDays((prev) => prev.map(d => d.date === date ? updated : d));
    setSelectedDay(updated);
    return updated;
  };

  useEffect(() => { fetchData(); }, [currentDate, view, group?.id]);

  const emptyForm = {
    workout_type: 'simple',
    title: '',
    content: '',
    warmup: '',
    main_session: '',
    cooldown: '',
    draft_content: '',
  };

  const openDay = (day) => {
    setSelectedDay(day);
    setEditingId(null);  // start in list view
    setForm(emptyForm);
    setSelectedRecipientIds([]);
    setOverrideMode(null);
    if (!groupDetail || groupDetail.id !== group.id) {
      fetchGroupDetail();
    }
  };

  const openWorkoutForEdit = (gw) => {
    setEditingId(gw.id);
    setForm({
      workout_type: gw.workout_type || 'simple',
      title: gw.title || '',
      content: gw.content || '',
      warmup: gw.warmup || '',
      main_session: gw.main_session || '',
      cooldown: gw.cooldown || '',
      draft_content: gw.draft_content || '',
    });
    const recips = gw.recipient_ids || [];
    setSelectedRecipientIds(recips);
    setInitialRecipientIds(recips);
    setOverrideMode(null);
  };

  const openWorkoutForCreate = () => {
    setEditingId('new');
    setForm(emptyForm);
    setSelectedRecipientIds([]);
    setInitialRecipientIds([]);
    setOverrideMode(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setInitialRecipientIds([]);
    setOverrideMode(null);
  };

  const handleSave = async (overrides = {}) => {
    setSaving(true);
    try {
      const payload = { ...form, ...overrides };
      if (['simple', 'easy', 'rest'].includes(payload.workout_type)) {
        payload.warmup = '';
        payload.main_session = '';
        payload.cooldown = '';
      } else if (['tempo', 'long', 'intervals', 'fartlek', 'race'].includes(payload.workout_type)) {
        payload.content = '';
      }
      const newRecips = selectedRecipientIds.slice();
      payload.recipient_ids = newRecips;
      // Only athletes the coach NEWLY added during this edit session should
      // trigger removal from other workouts. Athletes that were already in
      // this workout's recipient list when the form opened are left alone
      // (they may already coexist with another workout for legacy reasons).
      const initialSet = new Set(initialRecipientIds);
      const newlyAddedSet = new Set(newRecips.filter(aid => !initialSet.has(aid)));

      const otherWorkouts = (selectedDay.group_workouts || []).filter(
        gw => gw.id !== editingId
      );
      const cleanups = [];
      for (const gw of otherWorkouts) {
        const oldList = gw.recipient_ids || [];
        if (oldList.length === 0) continue;  // broadcast — nothing to prune
        const pruned = oldList.filter(aid => !newlyAddedSet.has(aid));
        if (pruned.length === oldList.length) continue;  // no overlap
        cleanups.push({ id: gw.id, recipients: pruned, deleteIfEmpty: pruned.length === 0 });
      }

      // Save (create or update) THIS workout first.
      if (editingId === 'new' || editingId == null) {
        await createGroupWorkout(group.id, selectedDay.date, payload);
      } else {
        await updateGroupWorkoutById(editingId, payload);
      }

      // Apply cleanups serially.
      for (const c of cleanups) {
        if (c.deleteIfEmpty) {
          await deleteGroupWorkoutById(c.id);
        } else {
          await updateGroupWorkoutById(c.id, { recipient_ids: c.recipients });
        }
      }

      await refetchDay(selectedDay.date);
      cancelEdit();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDeleteOne = async (workoutId) => {
    if (!confirm('Delete this workout?')) return;
    setSaving(true);
    try {
      await deleteGroupWorkoutById(workoutId);
      await refetchDay(selectedDay.date);
      if (editingId === workoutId) cancelEdit();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };


  const goBack = () => setCurrentDate(view === 'weekly' ? subWeeks(currentDate, 1) : subMonths(currentDate, 1));
  const goForward = () => setCurrentDate(view === 'weekly' ? addWeeks(currentDate, 1) : addMonths(currentDate, 1));

  const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
  const headerLabel = view === 'weekly'
    ? `${format(ws, 'MMM d')} - ${format(addDays(ws, 6), 'MMM d, yyyy')}`
    : format(currentDate, 'MMMM yyyy');

  const renderDayBadges = (day) => {
    const list = day.group_workouts || [];
    if (list.length === 0) return null;
    const shown = list.slice(0, 2);
    const extra = list.length - shown.length;
    return (
      <div className="flex gap-1 items-center flex-wrap">
        {shown.map((gw) => (
          <span key={gw.id} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeMeta(gw.workout_type).color}`}>
            {typeMeta(gw.workout_type).label}
            {gw.recipient_ids?.length > 0 && <span className="ml-1 opacity-70">·{gw.recipient_ids.length}</span>}
          </span>
        ))}
        {extra > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">+{extra}</span>}
        {list.some(g => g.draft_content) && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Draft</span>
        )}
      </div>
    );
  };

  const renderMonthGrid = () => {
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
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
            ⛶ Expand monthly view
          </button>
        </NoiseBackground>
        <div className="space-y-4">
        {weeks.map((week, wi) => (
          <div key={wi}>
            <p className="text-xs text-white/45 mb-1 font-medium">
              {format(new Date(week[0].date + 'T00:00'), 'MMM d')} - {format(new Date(week[6].date + 'T00:00'), 'MMM d')}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {week.map((day) => {
                const dayDate = new Date(day.date + 'T00:00');
                const inMonth = dayDate.getMonth() === currentDate.getMonth();
                const isToday = day.date === todayStr;
                const list = day.group_workouts || [];
                const published = list.filter(g => g.content || g.warmup || g.main_session || g.cooldown);
                const hasPublished = published.length > 0;
                const firstPub = published[0];
                const tMeta = firstPub ? typeMeta(firstPub.workout_type) : null;
                const cellIsRace = list.some(g => g.workout_type === 'race');
                const hasDraft = list.some(g => g.draft_content);
                return (
                  <button key={day.date} onClick={() => openDay(day)}
                    className={`flex flex-col items-center p-1.5 rounded-lg text-xs transition hover:shadow-sm relative ${
                      !inMonth ? 'opacity-40' : ''
                    } ${cellIsRace ? 'border-2 border-indigo-500 bg-indigo-50' :
                       isToday ? 'border border-blue-400 bg-blue-50' :
                       'border border-gray-200 bg-white'}`}>
                    {cellIsRace && (
                      <span className="absolute top-0.5 left-0.5 text-[10px] leading-none">🏁</span>
                    )}
                    {tMeta && !cellIsRace && (
                      <span className={`absolute top-0.5 right-0.5 text-[8px] px-1 py-px rounded font-semibold leading-none ${tMeta.color}`}>
                        {tMeta.abbr}
                      </span>
                    )}
                    {list.length > 1 && (
                      <span className="absolute bottom-0.5 right-0.5 text-[8px] px-1 leading-tight bg-blue-600 text-white rounded font-bold">+{list.length - 1}</span>
                    )}
                    <span className="font-semibold text-gray-900">{format(dayDate, 'd')}</span>
                    <span className="text-[10px] text-gray-400">{format(dayDate, 'EEE')}</span>
                    <div className="flex gap-0.5 mt-1">
                      {hasPublished && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
                      {hasDraft && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        </div>
      </div>
    );
  };

  if (!group) return null;

  return (
    <div>
      {group && (
        <>

          <div className="flex items-center justify-between mb-4">
            <button onClick={goBack} className="text-blue-200 hover:text-white text-sm font-medium transition">&larr; Prev</button>
            <span className="text-sm font-medium text-white/85">{headerLabel}</span>
            <button onClick={goForward} className="text-blue-200 hover:text-white text-sm font-medium transition">Next &rarr;</button>
          </div>

          <div className="flex rounded-lg border border-white/20 overflow-hidden mb-4">
            <button onClick={() => setView('weekly')}
              className={`flex-1 py-1.5 text-sm font-medium transition ${view === 'weekly' ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/70 hover:bg-white/15'}`}>
              Weekly</button>
            <button onClick={() => setView('monthly')}
              className={`flex-1 py-1.5 text-sm font-medium transition ${view === 'monthly' ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/70 hover:bg-white/15'}`}>
              Monthly</button>
          </div>

          {loading ? <Spinner /> : view === 'weekly' ? (
            <div className="space-y-2">
              {days.map((day) => {
                const dayDate = new Date(day.date + 'T00:00');
                const isToday = day.date === format(new Date(), 'yyyy-MM-dd');
                const list = day.group_workouts || [];
                const isRace = list.some(g => g.workout_type === 'race');
                return (
                <button key={day.date} onClick={() => openDay(day)}
                  className={`w-full text-left p-3 rounded-xl transition hover:shadow-sm backdrop-blur-sm ${
                    isRace ? 'border-2 border-indigo-400/70 bg-indigo-200/25' :
                    isToday ? 'border border-blue-300/60 bg-blue-200/25' :
                    'border border-white/30 bg-white/20'
                  }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
                      {isRace && <span className="mr-1">🏁</span>}
                      {format(dayDate, 'EEE, MMM d')}
                    </span>
                    {renderDayBadges(day)}
                  </div>
                  {list.length === 0 ? (
                    <p className="text-sm text-white/55 mt-1 italic">No workout set</p>
                  ) : list.length === 1 ? (
                    (() => {
                      const gw = list[0];
                      const snippet = workoutSnippet(gw);
                      if (snippet) return <p className="text-sm text-white font-semibold truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{snippet}</p>;
                      if (gw.draft_content) return <p className="text-sm text-yellow-200 truncate italic">{gw.draft_content}</p>;
                      return null;
                    })()
                  ) : (
                    <div className="mt-1 space-y-0.5">
                      {list.slice(0, 3).map((gw) => (
                        <p key={gw.id} className="text-xs text-white/80 truncate">
                          • {workoutSnippet(gw) || gw.draft_content || typeMeta(gw.workout_type).label}
                          {gw.recipient_ids?.length > 0 && (
                            <span className="text-white/55"> · {gw.recipient_ids.length} athlete{gw.recipient_ids.length === 1 ? '' : 's'}</span>
                          )}
                        </p>
                      ))}
                      {list.length > 3 && <p className="text-[11px] text-white/50">+{list.length - 3} more…</p>}
                    </div>
                  )}
                </button>
                );
              })}
            </div>
          ) : renderMonthGrid()}
        </>
      )}

      {/* Workout edit modal */}
      <Modal open={!!selectedDay} onClose={() => { setSelectedDay(null); cancelEdit(); }} title={selectedDay ? format(new Date(selectedDay.date + 'T00:00'), 'EEEE, MMM d') : ''}>
        {selectedDay && editingId == null && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              {(selectedDay.group_workouts || []).length === 0
                ? 'No workouts yet for this day.'
                : `${selectedDay.group_workouts.length} workout${selectedDay.group_workouts.length === 1 ? '' : 's'} scheduled`}
            </p>
            {(selectedDay.group_workouts || []).map((gw) => {
              const tm = typeMeta(gw.workout_type);
              const recCount = gw.recipient_ids?.length || 0;
              const recNames = recCount > 0 && groupDetail
                ? groupDetail.members.filter(m => gw.recipient_ids.includes(m.id)).map(m => m.full_name)
                : [];
              const snippet = workoutSnippet(gw);
              return (
                <div key={gw.id} className={`rounded-lg p-3 border ${gw.workout_type === 'race' ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${tm.color}`}>{tm.label}</span>
                        {gw.draft_content && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Draft</span>}
                      </div>
                      {(gw.title || snippet) && (
                        <p className="text-sm font-medium text-gray-800 mt-1 truncate">{gw.title || snippet}</p>
                      )}
                      <p className="text-[11px] text-gray-500 mt-1">
                        {recCount === 0
                          ? '👥 All athletes (broadcast)'
                          : `👥 ${recCount}: ${recNames.length ? recNames.join(', ') : `${recCount} athlete${recCount === 1 ? '' : 's'}`}`}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openWorkoutForEdit(gw)}
                        className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50">Edit</button>
                      <button onClick={() => handleDeleteOne(gw.id)} disabled={saving}
                        className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
            <button onClick={openWorkoutForCreate}
              className="w-full border-2 border-dashed border-blue-300 text-blue-700 rounded-lg py-3 text-sm font-medium hover:bg-blue-50 transition">
              ➕ Add a workout
            </button>
          </div>
        )}
        {selectedDay && editingId != null && (() => {
          const meta = typeMeta(form.workout_type);
          const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
          const hasPublishedContent = meta.structured
            ? (form.warmup.trim() || form.main_session.trim() || form.cooldown.trim())
            : form.content.trim();

          // Map athleteId → other workouts that day they're already on
          // (excluding the workout being edited).
          const assignmentsByAthlete = {};
          (selectedDay.group_workouts || []).forEach(gw => {
            if (gw.id === editingId) return;
            (gw.recipient_ids || []).forEach(aid => {
              const label = gw.title || typeMeta(gw.workout_type).label;
              (assignmentsByAthlete[aid] ||= []).push({ id: gw.id, label });
            });
          });
          const memberIds = (groupDetail?.members || []).map(m => m.id);
          const unassignedIds = memberIds.filter(id => !assignmentsByAthlete[id]);
          const assignedCount = memberIds.length - unassignedIds.length;

          // "Overridden" indicator: this is for legacy data where an athlete
          // sits in two workouts' recipient lists. Only apply it to athletes
          // who were ALREADY in this workout's initial recipient list —
          // athletes the coach just added in this session will be moved on
          // save via the cleanup logic, so they shouldn't appear struck-through.
          const overriddenIds = new Set();
          if (typeof editingId === 'number') {
            const initialSet = new Set(initialRecipientIds);
            memberIds.forEach(aid => {
              if (!initialSet.has(aid)) return;
              if (!selectedRecipientIds.includes(aid)) return;
              const others = assignmentsByAthlete[aid] || [];
              if (others.some(o => o.id > editingId)) overriddenIds.add(aid);
            });
          }

          return (
            <div className="space-y-4">
              {/* Workout type selector */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Type</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {WORKOUT_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setField('workout_type', t.value)}
                      className={`text-xs px-2 py-1.5 rounded-lg font-medium border transition ${
                        form.workout_type === t.value
                          ? `${t.color} border-current`
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Title (shown on calendar)</p>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setField('title', e.target.value)}
                  placeholder={meta.value === 'intervals' ? 'e.g., 6x800m @ threshold' : 'e.g., Park loop'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Published content — simple/easy/tempo (single field) OR long/intervals/fartlek (3 fields) */}
              {meta.structured ? (
                <div className="space-y-2 border border-green-200 bg-green-50/30 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-700">Published — visible to athletes</p>
                  <div>
                    <p className="text-[11px] text-gray-500 mb-0.5">Warm-up</p>
                    <textarea value={form.warmup} onChange={(e) => setField('warmup', e.target.value)}
                      placeholder="e.g., 15 min easy + drills" rows={2}
                      className="w-full border border-green-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 bg-white" />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 mb-0.5">{meta.mainLabel || 'Main session'}</p>
                    <textarea value={form.main_session} onChange={(e) => setField('main_session', e.target.value)}
                      placeholder={meta.value === 'race' ? 'e.g., 10K' : 'e.g., 6x800m @ 5k pace, 2 min rest'} rows={3}
                      className="w-full border border-green-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 bg-white" />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 mb-0.5">Cool-down</p>
                    <textarea value={form.cooldown} onChange={(e) => setField('cooldown', e.target.value)}
                      placeholder="e.g., 10 min easy + stretching" rows={2}
                      className="w-full border border-green-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 bg-white" />
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-1">Published — visible to athletes</p>
                  <textarea value={form.content} onChange={(e) => setField('content', e.target.value)}
                    placeholder="Write the workout..." rows={3}
                    className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-green-50/50" />
                </div>
              )}

              {/* Recipients */}
              <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700">Choose athletes</p>

                {groupDetail && groupDetail.members.length > 0 && (
                  <>
                    {assignedCount > 0 && (
                      <p className="text-[11px] italic text-gray-500">
                        {assignedCount} of {groupDetail.members.length} athlete{groupDetail.members.length === 1 ? '' : 's'} already have a workout today.
                      </p>
                    )}

                    {/* Quick actions */}
                    {overrideMode == null && (
                      <div className="flex gap-2 flex-wrap">
                        <button type="button"
                          onClick={() => setSelectedRecipientIds(prev => Array.from(new Set([...prev, ...unassignedIds])))}
                          disabled={unassignedIds.length === 0}
                          className="text-[11px] px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-40">
                          + Add all unassigned ({unassignedIds.length})
                        </button>
                        <button type="button"
                          onClick={() => {
                            // Athletes that would be NEWLY selected by "all" and
                            // are on another workout — those require confirmation.
                            const conflicting = memberIds.filter(id =>
                              (assignmentsByAthlete[id] || []).length > 0 && !selectedRecipientIds.includes(id)
                            );
                            if (conflicting.length === 0) {
                              setSelectedRecipientIds(memberIds);
                            } else {
                              setOverridePickIds(conflicting);
                              setOverrideMode('confirm');
                            }
                          }}
                          className="text-[11px] px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">
                          + Add all athletes
                        </button>
                      </div>
                    )}

                    {/* Override-confirm panel */}
                    {overrideMode === 'confirm' && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 space-y-2">
                        <p className="text-[12px] text-amber-900 font-semibold">
                          Override {overridePickIds.length} athlete{overridePickIds.length === 1 ? '' : 's'}?
                        </p>
                        <p className="text-[11px] text-amber-800">
                          These already have a workout today:&nbsp;
                          <span className="font-medium">
                            {(groupDetail?.members || [])
                              .filter(m => overridePickIds.includes(m.id))
                              .map(m => m.full_name).join(', ')}
                          </span>
                          . Saving will move them to this workout and remove them from the previous one.
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          <button type="button"
                            onClick={() => { setSelectedRecipientIds(memberIds); setOverrideMode(null); }}
                            className="text-[11px] px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700">
                            Override all
                          </button>
                          <button type="button"
                            onClick={() => setOverrideMode('pick')}
                            className="text-[11px] px-2 py-1 rounded border border-amber-400 text-amber-900 hover:bg-amber-100">
                            Pick which to override
                          </button>
                          <button type="button"
                            onClick={() => setOverrideMode(null)}
                            className="text-[11px] px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Pick-which override panel */}
                    {overrideMode === 'pick' && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 space-y-2">
                        <p className="text-[12px] text-amber-900 font-semibold">Tick athletes to override</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                          {(groupDetail?.members || [])
                            .filter(m => (assignmentsByAthlete[m.id] || []).length > 0 && !selectedRecipientIds.includes(m.id))
                            .map(m => {
                              const checked = overridePickIds.includes(m.id);
                              const labels = (assignmentsByAthlete[m.id] || []).map(a => a.label).join(', ');
                              return (
                                <label key={m.id} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer">
                                  <input type="checkbox" checked={checked}
                                    onChange={(e) => setOverridePickIds(prev =>
                                      e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id)
                                    )}
                                    className="w-4 h-4 rounded" />
                                  <span className="text-[12px] text-gray-800">{m.full_name}</span>
                                  <span className="text-[10px] text-gray-500 italic">• on "{labels}"</span>
                                </label>
                              );
                            })}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <button type="button"
                            onClick={() => {
                              const unassignedToAdd = memberIds.filter(id => !(assignmentsByAthlete[id]?.length > 0));
                              const next = Array.from(new Set([...selectedRecipientIds, ...unassignedToAdd, ...overridePickIds]));
                              setSelectedRecipientIds(next);
                              setOverrideMode(null);
                            }}
                            className="text-[11px] px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700">
                            Apply
                          </button>
                          <button type="button"
                            onClick={() => setOverrideMode('confirm')}
                            className="text-[11px] px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">
                            Back
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Members checkbox list */}
                {groupDetail && groupDetail.members.length > 0 ? (
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {groupDetail.members.map(m => {
                      const inList = selectedRecipientIds.includes(m.id);
                      const overridden = overriddenIds.has(m.id);
                      const checked = inList && !overridden;
                      const otherAssignments = assignmentsByAthlete[m.id] || [];
                      const onOther = otherAssignments.length > 0;
                      return (
                        <label key={m.id} className="flex items-start gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const willCheck = e.target.checked;
                              const apply = () => setSelectedRecipientIds(prev =>
                                willCheck
                                  ? [...prev, m.id]
                                  : prev.filter(id => id !== m.id)
                              );
                              // If turning on AND athlete is already on another
                              // workout that day, ask for confirmation first.
                              if (willCheck && onOther) {
                                setTransferPrompt({
                                  athleteName: m.full_name,
                                  fromLabels: otherAssignments.map(a => a.label),
                                  onConfirm: apply,
                                });
                                return;
                              }
                              apply();
                            }}
                            className="w-4 h-4 rounded mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm ${overridden ? 'text-gray-400 line-through' : ''}`}>{m.full_name}</span>
                              {onOther && (
                                <span className="text-[10px] text-gray-500 italic">
                                  • on "{otherAssignments.map(a => a.label).join('", "')}"
                                </span>
                              )}
                            </div>
                            {overridden && (
                              <p className="text-[10px] text-amber-700 mt-0.5">
                                ↪ currently sees a newer workout that day
                              </p>
                            )}
                            {!overridden && onOther && checked && (
                              <p className="text-[10px] text-amber-700 mt-0.5">
                                ↪ will move from previous workout on save
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : groupDetail ? (
                  <p className="text-xs text-gray-400 italic">No athletes in this group</p>
                ) : (
                  <p className="text-xs text-gray-400 italic">Loading members…</p>
                )}
                {selectedRecipientIds.length === 0 && (
                  <p className="text-[11px] text-orange-600">⚠ No athletes selected — this workout won't be visible to anyone.</p>
                )}
              </div>

              {/* Draft */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-yellow-700">Draft (only you can see)</p>
                  {form.draft_content.trim() && <span className="w-2 h-2 rounded-full bg-yellow-400" />}
                </div>
                <textarea value={form.draft_content} onChange={(e) => setField('draft_content', e.target.value)}
                  placeholder="Write a draft..." rows={2}
                  className="w-full border border-yellow-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-yellow-50/50" />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => handleSave()}
                  disabled={saving || (!hasPublishedContent && !form.title.trim() && !form.draft_content.trim())}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? 'Saving...' : (editingId === 'new' ? 'Create workout' : 'Save changes')}</button>
                <button onClick={cancelEdit}
                  className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Back</button>
              </div>
              {editingId !== 'new' && typeof editingId === 'number' && (
                <button onClick={() => handleDeleteOne(editingId)} disabled={saving} className="w-full text-red-500 text-sm hover:underline">Delete this workout</button>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Expanded month view (publisher) */}
      <Modal
        open={monthExpanded}
        onClose={() => setMonthExpanded(false)}
        title="Training log"
        fullScreen
        panelClassName="bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950"
      >
        {group && (
          <div>
            <p className="text-xs text-white/60 -mt-2 mb-3">{group.name}</p>

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
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                className="text-blue-300 hover:text-blue-200 text-sm transition"
              >&larr; Prev</button>
              <YearMonthLabel
                currentDate={currentDate}
                onYearChange={(y) => setCurrentDate(new Date(y, currentDate.getMonth(), 1))}
                className="text-sm font-semibold text-white"
              />
              <button
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="text-blue-300 hover:text-blue-200 text-sm transition"
              >Next &rarr;</button>
            </div>

            <div
              ref={expandedScrollRef}
              className="overflow-x-auto -mx-2"
              style={{ touchAction: 'pan-x pan-y' }}
            >
              <div className="px-2" style={{ minWidth: '840px', zoom: expandedZoom }}>
                <div className="grid grid-cols-7 gap-1 mb-1 text-xs text-white/60 text-center font-medium">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <div key={i}>{d}</div>)}
                </div>
                <div className="space-y-1">
                  {(() => {
                    const weeks = [];
                    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
                    return weeks;
                  })().map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-1">
                      {week.map(d => {
                        const dayDate = new Date(d.date + 'T00:00');
                        const inMonth = isSameMonth(dayDate, currentDate);
                        const list = d.group_workouts || [];
                        const published = list.filter(g => g.content || g.warmup || g.main_session || g.cooldown);
                        const firstPub = published[0];
                        const hasPublished = !!firstPub;
                        const draftOnly = !hasPublished && list.find(g => g.draft_content);
                        const tMeta = firstPub ? typeMeta(firstPub.workout_type) : (draftOnly ? typeMeta(draftOnly.workout_type) : null);
                        const body = firstPub
                          ? (firstPub.content || firstPub.main_session || firstPub.warmup || '')
                          : (draftOnly?.draft_content || '');
                        const cellIsRace = list.some(g => g.workout_type === 'race');
                        const cellHeight = 150;
                        const bg = !inMonth ? 'bg-white/5 border-white/10 opacity-60' :
                          hasPublished ? 'bg-green-500/30 border-green-400/40 hover:bg-green-500/40' :
                          draftOnly ? 'bg-yellow-500/25 border-yellow-400/40 hover:bg-yellow-500/35' :
                          'bg-white/20 border-white/30 hover:bg-white/30';
                        return (
                          <button
                            key={d.date}
                            onClick={() => { setMonthExpanded(false); openDay(d); }}
                            className={`rounded-lg ${cellIsRace ? 'border-2 border-indigo-500' : 'border'} ${bg} relative flex flex-col text-left transition overflow-hidden`}
                            style={{ minHeight: `${cellHeight}px` }}
                          >
                            <div className="flex items-start justify-between px-2 pt-1.5">
                              <span className="text-[11px] text-white/75 font-semibold leading-none">{format(dayDate, 'd')}</span>
                              {tMeta && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none ${tMeta.color}`}>
                                  {tMeta.label}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 px-2 py-1 min-h-0">
                              {firstPub?.title && (
                                <p className="text-xs font-semibold text-white leading-tight line-clamp-2 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
                                  {cellIsRace && '🏁 '}{firstPub.title}
                                </p>
                              )}
                              {!firstPub?.title && cellIsRace && (
                                <p className="text-xs font-semibold text-indigo-200 leading-tight">🏁 Race</p>
                              )}
                              {body && (
                                <p className={`text-[10px] leading-tight line-clamp-3 mt-0.5 whitespace-pre-wrap ${hasPublished ? 'text-white/75' : 'text-yellow-200 italic'}`}>
                                  {body}
                                </p>
                              )}
                              {!hasPublished && !draftOnly && (
                                <p className="text-[10px] text-white/40 italic">No workout set</p>
                              )}
                              {list.length > 1 && (
                                <p className="text-[9px] text-white/60 mt-1">+{list.length - 1} more</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Transfer-confirm sheet — mobile-first; bottom sheet on small screens, centered card on larger */}
      {transferPrompt && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
          onClick={() => setTransferPrompt(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xl shrink-0">↪</div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-gray-900">
                  Move {transferPrompt.athleteName}?
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Already has{' '}
                  <span className="font-medium text-gray-800">
                    "{transferPrompt.fromLabels.join('", "')}"
                  </span>{' '}
                  scheduled today. Saving will move them to this workout.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setTransferPrompt(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold active:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  transferPrompt.onConfirm();
                  setTransferPrompt(null);
                }}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold active:bg-blue-700 shadow-sm"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
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
