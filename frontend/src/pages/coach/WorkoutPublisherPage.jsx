import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, subWeeks, addWeeks, subMonths, addMonths } from 'date-fns';
import { getCoachGroupWeek, createGroupWorkout, updateGroupWorkoutById, deleteGroupWorkoutById } from '../../api/calendar';
import { listGroups, createGroup, getGroup, renameGroup, deleteGroup, addMemberToGroup, removeMemberFromGroup, listAthletes } from '../../api/coach';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { Link } from 'react-router-dom';

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

export default function WorkoutPublisherPage() {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetail, setGroupDetail] = useState(null);
  const [allAthletes, setAllAthletes] = useState([]);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

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
  const [expandedZoom, setExpandedZoom] = useState(1);

  const fetchGroups = async () => {
    try {
      const { data } = await listGroups();
      setGroups(data);
      if (!selectedGroup && data.length > 0) setSelectedGroup(data[0]);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchGroups(); }, []);

  const fetchGroupDetail = async () => {
    if (!selectedGroup) return;
    try {
      const [detail, athletes] = await Promise.all([getGroup(selectedGroup.id), listAthletes()]);
      setGroupDetail(detail.data);
      setAllAthletes(athletes.data);
    } catch (err) { console.error(err); }
  };

  const fetchData = async () => {
    if (!selectedGroup) { setDays([]); return; }
    setLoading(true);
    try {
      if (view === 'weekly') {
        const { data } = await getCoachGroupWeek(selectedGroup.id, format(currentDate, 'yyyy-MM-dd'));
        setDays(data.days);
      } else {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        const calEnd = startOfWeek(monthEnd, { weekStartsOn: 0 });
        const weeks = [];
        let ws = calStart;
        while (ws <= calEnd) {
          weeks.push(getCoachGroupWeek(selectedGroup.id, format(ws, 'yyyy-MM-dd')));
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
    if (!selectedGroup) return null;
    const { data } = await getCoachGroupWeek(selectedGroup.id, date);
    const updated = data.days.find(d => d.date === date);
    if (!updated) return null;
    setDays((prev) => prev.map(d => d.date === date ? updated : d));
    setSelectedDay(updated);
    return updated;
  };

  useEffect(() => { fetchData(); }, [currentDate, view, selectedGroup]);

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
    if (!groupDetail || groupDetail.id !== selectedGroup.id) {
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
        await createGroupWorkout(selectedGroup.id, selectedDay.date, payload);
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

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const { data } = await createGroup(newGroupName.trim());
      setNewGroupName('');
      await fetchGroups();
      setSelectedGroup(data);
    } catch (err) { console.error(err); }
    finally { setCreatingGroup(false); }
  };

  const handleDeleteGroup = async (id) => {
    try {
      await deleteGroup(id);
      if (selectedGroup?.id === id) setSelectedGroup(null);
      fetchGroups();
      setShowGroupManager(false);
    } catch (err) { console.error(err); }
  };

  const handleAddMember = async (athleteId) => {
    try {
      await addMemberToGroup(selectedGroup.id, athleteId);
      fetchGroupDetail();
      fetchGroups();
    } catch (err) { console.error(err); }
  };

  const handleRemoveMember = async (athleteId) => {
    try {
      await removeMemberFromGroup(selectedGroup.id, athleteId);
      fetchGroupDetail();
      fetchGroups();
    } catch (err) { console.error(err); }
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
    return (
      <div>
        <div className="flex items-center justify-end mb-2">
          <button onClick={() => setMonthExpanded(true)} className="text-xs text-blue-600 hover:underline font-medium">⛶ Expand</button>
        </div>
        <div className="space-y-4">
        {weeks.map((week, wi) => (
          <div key={wi}>
            <p className="text-xs text-gray-400 mb-1 font-medium">
              {format(new Date(week[0].date + 'T00:00'), 'MMM d')} - {format(new Date(week[6].date + 'T00:00'), 'MMM d')}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {week.map((day) => {
                const inMonth = new Date(day.date + 'T00:00').getMonth() === currentDate.getMonth();
                const list = day.group_workouts || [];
                const published = list.filter(g => g.content || g.warmup || g.main_session || g.cooldown);
                const hasPublished = published.length > 0;
                const firstPub = published[0];
                const tMeta = firstPub ? typeMeta(firstPub.workout_type) : null;
                const cellIsRace = list.some(g => g.workout_type === 'race');
                const hasDraft = list.some(g => g.draft_content);
                const titleForCell = firstPub?.title;
                return (
                  <button key={day.date} onClick={() => openDay(day)}
                    className={`flex flex-col items-center p-1.5 rounded-lg text-xs transition hover:shadow-sm relative ${
                      !inMonth ? 'opacity-40' : ''
                    } ${cellIsRace ? 'border-2 border-indigo-500 bg-indigo-50' :
                       hasPublished ? 'border border-green-300 bg-green-50' :
                       hasDraft ? 'border border-yellow-300 bg-yellow-50' :
                       'border border-gray-200 bg-white'}`}>
                    {cellIsRace && (
                      <span className="absolute top-0 left-0 text-[10px] leading-none">🏁</span>
                    )}
                    {tMeta && !cellIsRace && (
                      <span className={`absolute top-0 left-0 text-[7px] px-0.5 rounded-br font-bold leading-none ${tMeta.color}`}>
                        {tMeta.abbr}
                      </span>
                    )}
                    {list.length > 1 && (
                      <span className="absolute top-0 right-0 text-[8px] px-1 leading-tight bg-blue-600 text-white rounded-bl font-bold">{list.length}</span>
                    )}
                    <span className="font-semibold">{format(new Date(day.date + 'T00:00'), 'd')}</span>
                    <span className="text-[10px] text-gray-400">{format(new Date(day.date + 'T00:00'), 'EEE')}</span>
                    {titleForCell && (
                      <span className="text-[9px] text-gray-700 mt-0.5 truncate w-full text-center font-medium">{titleForCell}</span>
                    )}
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

  const unassignedAthletes = groupDetail
    ? allAthletes.filter(a => !groupDetail.members.some(m => m.id === a.id) && (!a.training_group_id || a.training_group_id === selectedGroup?.id))
    : [];

  const athletesInOtherGroups = groupDetail
    ? allAthletes.filter(a => a.training_group_id && a.training_group_id !== selectedGroup?.id && !groupDetail.members.some(m => m.id === a.id))
    : [];

  return (
    <div>
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950" />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-xl font-bold flex-1 text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">Coach Panel</h2>
        <Link to="/coach/targets" className="text-sm text-blue-200 hover:text-white transition">Targets</Link>
        <Link to="/coach/dashboard" className="text-sm text-blue-200 hover:text-white transition">Athletes Tracking</Link>
        <Link to="/coach/race-wizard" className="text-sm text-blue-200 hover:text-white transition">New Race</Link>
        <Link to="/coach/settings" className="text-sm text-blue-200 hover:text-white transition">Settings</Link>
      </div>

      <h3 className="text-base font-semibold mb-3 text-white/85">Training Groups</h3>

      {groups.length === 0 && !newGroupName ? (
        <div className="text-center py-8">
          <p className="text-sm text-white/55 mb-3">No training groups yet. Create your first one.</p>
        </div>
      ) : (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {groups.map((g) => (
            <button key={g.id} onClick={() => setSelectedGroup(g)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition ${
                selectedGroup?.id === g.id ? 'bg-blue-500 text-white' : 'bg-white/10 backdrop-blur-sm border border-white/20 text-white/80 hover:bg-white/20'
              }`}>
              {g.name} ({g.member_count})
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
          placeholder="New group name..."
          className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
        />
        <button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()}
          className="bg-white text-black rounded-lg px-4 py-1.5 text-sm font-semibold hover:bg-white/85 disabled:opacity-50">
          Create
        </button>
        {selectedGroup && (
          <button onClick={() => { fetchGroupDetail(); setShowGroupManager(true); }}
            className="border border-white/25 rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 transition">
            Manage
          </button>
        )}
      </div>

      {selectedGroup && (
        <>
          <h3 className="text-base font-semibold mb-3 text-white/85">Workouts: {selectedGroup.name}</h3>

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
                const list = day.group_workouts || [];
                const isRace = list.some(g => g.workout_type === 'race');
                const firstPub = list.find(g => g.content || g.warmup || g.main_session || g.cooldown);
                const draftOnly = !firstPub && list.find(g => g.draft_content);
                return (
                <button key={day.date} onClick={() => openDay(day)}
                  className={`w-full text-left p-3 rounded-xl hover:shadow-sm transition ${isRace ? 'border-2 border-indigo-500 bg-indigo-50' : 'border border-gray-200 bg-white'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{isRace && '🏁 '}{format(new Date(day.date + 'T00:00'), 'EEE, MMM d')}</span>
                    {renderDayBadges(day)}
                  </div>
                  {list.length === 0 ? (
                    <p className="text-sm text-gray-400 mt-1 italic">No workout set</p>
                  ) : list.length === 1 ? (
                    (() => {
                      const gw = list[0];
                      const snippet = workoutSnippet(gw);
                      if (snippet) return <p className="text-sm text-gray-700 mt-1 truncate font-medium">{snippet}</p>;
                      if (gw.draft_content) return <p className="text-sm text-yellow-600 mt-1 truncate italic">{gw.draft_content}</p>;
                      return null;
                    })()
                  ) : (
                    <div className="mt-1 space-y-0.5">
                      {list.slice(0, 3).map((gw) => (
                        <p key={gw.id} className="text-xs text-gray-600 truncate">
                          • {workoutSnippet(gw) || gw.draft_content || typeMeta(gw.workout_type).label}
                          {gw.recipient_ids?.length > 0 && (
                            <span className="text-gray-400"> · {gw.recipient_ids.length} athlete{gw.recipient_ids.length === 1 ? '' : 's'}</span>
                          )}
                        </p>
                      ))}
                      {list.length > 3 && <p className="text-[11px] text-gray-400">+{list.length - 3} more…</p>}
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

      {/* Group manager modal */}
      <Modal open={showGroupManager} onClose={() => setShowGroupManager(false)} title={`Manage: ${selectedGroup?.name || ''}`}>
        {selectedGroup && groupDetail && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Members ({groupDetail.members.length})</p>
              {groupDetail.members.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No members yet</p>
              ) : (
                <div className="space-y-1">
                  {groupDetail.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                      <span className="text-sm">{m.full_name} <span className="text-xs text-gray-400">({m.gender})</span></span>
                      <button onClick={() => handleRemoveMember(m.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {unassignedAthletes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Add Athletes</p>
                <div className="space-y-1">
                  {unassignedAthletes.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                      <span className="text-sm">{a.full_name}</span>
                      <button onClick={() => handleAddMember(a.id)} className="text-xs text-blue-600 hover:underline">Add</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {athletesInOtherGroups.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">In Other Groups (will be moved)</p>
                <div className="space-y-1">
                  {athletesInOtherGroups.map((a) => {
                    const otherGroup = groups.find(g => g.id === a.training_group_id);
                    return (
                      <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-orange-50">
                        <span className="text-sm">{a.full_name} <span className="text-xs text-orange-500">({otherGroup?.name})</span></span>
                        <button onClick={() => handleAddMember(a.id)} className="text-xs text-orange-600 hover:underline">Move here</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t pt-3">
              <button onClick={() => handleDeleteGroup(selectedGroup.id)}
                className="w-full text-red-500 text-sm hover:underline">Delete this group</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Expanded month view (publisher) */}
      <Modal open={monthExpanded} onClose={() => setMonthExpanded(false)}
        title={selectedGroup ? `${selectedGroup.name} — ${format(currentDate, 'MMMM yyyy')}` : 'Month view'}>
        {selectedGroup && (
          <div>
            <div className="flex items-center justify-end gap-2 mb-2">
              <span className="text-xs text-gray-500">Zoom</span>
              <button onClick={() => setExpandedZoom(z => Math.max(0.3, +(z - 0.05).toFixed(2)))}
                disabled={expandedZoom <= 0.3}
                className="w-7 h-7 rounded border border-gray-200 text-sm font-bold hover:bg-gray-50 disabled:opacity-30">−</button>
              <span className="text-xs font-mono w-10 text-center">{Math.round(expandedZoom * 100)}%</span>
              <button onClick={() => setExpandedZoom(z => Math.min(1.8, +(z + 0.05).toFixed(2)))}
                disabled={expandedZoom >= 1.8}
                className="w-7 h-7 rounded border border-gray-200 text-sm font-bold hover:bg-gray-50 disabled:opacity-30">+</button>
              <button onClick={() => setExpandedZoom(1)} className="text-xs text-blue-600 hover:underline ml-1">Reset</button>
            </div>

            {/* Month navigation at the top */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="text-blue-600 text-sm">&larr; Prev</button>
              <span className="text-sm font-semibold">{format(currentDate, 'MMMM yyyy')}</span>
              <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="text-blue-600 text-sm">Next &rarr;</button>
            </div>

            <div className="overflow-x-auto -mx-2">
              <div className="px-2" style={{ minWidth: `${Math.round(840 * expandedZoom)}px` }}>
                <div className="grid grid-cols-7 gap-1 mb-1 text-xs text-gray-500 text-center font-medium">
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
                        const inMonth = dayDate.getMonth() === currentDate.getMonth();
                        const gw = d.group_workout;
                        const hasPublished = gw && (gw.content || gw.warmup || gw.main_session || gw.cooldown);
                        const cellHeight = Math.round(150 * expandedZoom);
                        if (!inMonth) return <div key={d.date} style={{ minHeight: `${cellHeight}px` }} />;
                        const tMeta = hasPublished ? typeMeta(gw.workout_type) : null;
                        const body = hasPublished
                          ? (gw.content || gw.main_session || gw.warmup || '')
                          : (gw?.draft_content || '');
                        const cellIsRace = gw?.workout_type === 'race';
                        return (
                          <button
                            key={d.date}
                            onClick={() => { setMonthExpanded(false); openDay(d); }}
                            className={`rounded-lg ${cellIsRace ? 'border-2 border-indigo-500' : 'border'} ${hasPublished ? (cellIsRace ? 'bg-indigo-50' : 'border-green-300 bg-green-50') : gw?.draft_content ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'} relative flex flex-col text-left transition overflow-hidden`}
                            style={{ minHeight: `${cellHeight}px` }}
                          >
                            <div className="flex items-start justify-between px-2 pt-1.5">
                              <span className="text-[11px] text-gray-500 leading-none">{format(dayDate, 'd')}</span>
                              {tMeta && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none ${tMeta.color}`}>
                                  {tMeta.label}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 px-2 py-1 min-h-0">
                              {gw?.title && (
                                <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{cellIsRace && '🏁 '}{gw.title}</p>
                              )}
                              {!gw?.title && cellIsRace && (
                                <p className="text-xs font-semibold text-indigo-700 leading-tight">🏁 Race</p>
                              )}
                              {body && (
                                <p className={`text-[10px] leading-tight line-clamp-3 mt-0.5 whitespace-pre-wrap ${hasPublished ? 'text-gray-600' : 'text-yellow-700 italic'}`}>{body}</p>
                              )}
                              {!hasPublished && !gw?.draft_content && (
                                <p className="text-[10px] text-gray-300 italic">No workout set</p>
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
