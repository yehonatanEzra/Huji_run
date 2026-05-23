import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, subWeeks, addWeeks, subMonths, addMonths } from 'date-fns';
import { getWeek, upsertGroupWorkout, deleteGroupWorkout } from '../../api/calendar';
import { listGroups, createGroup, getGroup, renameGroup, deleteGroup, addMemberToGroup, removeMemberFromGroup, listAthletes } from '../../api/coach';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { Link } from 'react-router-dom';

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
  const [published, setPublished] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

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
        const { data } = await getWeek(format(currentDate, 'yyyy-MM-dd'), selectedGroup.id);
        setDays(data.days);
      } else {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        const calEnd = startOfWeek(monthEnd, { weekStartsOn: 0 });
        const weeks = [];
        let ws = calStart;
        while (ws <= calEnd) {
          weeks.push(getWeek(format(ws, 'yyyy-MM-dd'), selectedGroup.id));
          ws = addDays(ws, 7);
        }
        const results = await Promise.all(weeks);
        setDays(results.flatMap(r => r.data.days));
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [currentDate, view, selectedGroup]);

  const openDay = (day) => {
    setSelectedDay(day);
    setPublished(day.group_workout?.content || '');
    setDraft(day.group_workout?.draft_content || '');
  };

  const handleSave = async (updates) => {
    setSaving(true);
    try {
      await upsertGroupWorkout(selectedGroup.id, selectedDay.date, updates);
      setSelectedDay(null);
      fetchData();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteGroupWorkout(selectedGroup.id, selectedDay.date);
      setSelectedDay(null);
      fetchData();
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
    const gw = day.group_workout;
    if (!gw) return null;
    return (
      <div className="flex gap-1">
        {gw.content && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Published</span>}
        {gw.draft_content && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Draft</span>}
      </div>
    );
  };

  const renderMonthGrid = () => {
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return (
      <div className="space-y-4">
        {weeks.map((week, wi) => (
          <div key={wi}>
            <p className="text-xs text-gray-400 mb-1 font-medium">
              {format(new Date(week[0].date + 'T00:00'), 'MMM d')} - {format(new Date(week[6].date + 'T00:00'), 'MMM d')}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {week.map((day) => {
                const inMonth = new Date(day.date + 'T00:00').getMonth() === currentDate.getMonth();
                const gw = day.group_workout;
                return (
                  <button key={day.date} onClick={() => openDay(day)}
                    className={`flex flex-col items-center p-1.5 rounded-lg border text-xs transition hover:shadow-sm ${
                      !inMonth ? 'opacity-40' : ''
                    } ${gw?.content ? 'border-green-300 bg-green-50' : gw?.draft_content ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'}`}>
                    <span className="font-semibold">{format(new Date(day.date + 'T00:00'), 'd')}</span>
                    <span className="text-[10px] text-gray-400">{format(new Date(day.date + 'T00:00'), 'EEE')}</span>
                    <div className="flex gap-0.5 mt-1">
                      {gw?.content && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
                      {gw?.draft_content && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
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
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold flex-1">Coach Panel</h2>
        <Link to="/coach/targets" className="text-sm text-blue-600 hover:underline">Targets</Link>
        <Link to="/coach/dashboard" className="text-sm text-blue-600 hover:underline">Athletes Tracking</Link>
        <Link to="/coach/race-wizard" className="text-sm text-blue-600 hover:underline">New Race</Link>
        <Link to="/coach/settings" className="text-sm text-blue-600 hover:underline">Settings</Link>
      </div>

      <h3 className="text-base font-semibold mb-3">Training Groups</h3>

      {groups.length === 0 && !newGroupName ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 mb-3">No training groups yet. Create your first one.</p>
        </div>
      ) : (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {groups.map((g) => (
            <button key={g.id} onClick={() => setSelectedGroup(g)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition ${
                selectedGroup?.id === g.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
          className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()}
          className="bg-blue-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          Create
        </button>
        {selectedGroup && (
          <button onClick={() => { fetchGroupDetail(); setShowGroupManager(true); }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            Manage
          </button>
        )}
      </div>

      {selectedGroup && (
        <>
          <h3 className="text-base font-semibold mb-3">Workouts — {selectedGroup.name}</h3>

          <div className="flex items-center justify-between mb-4">
            <button onClick={goBack} className="text-blue-600 text-sm font-medium">&larr; Prev</button>
            <span className="text-sm font-medium">{headerLabel}</span>
            <button onClick={goForward} className="text-blue-600 text-sm font-medium">Next &rarr;</button>
          </div>

          <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
            <button onClick={() => setView('weekly')}
              className={`flex-1 py-1.5 text-sm font-medium transition ${view === 'weekly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>
              Weekly</button>
            <button onClick={() => setView('monthly')}
              className={`flex-1 py-1.5 text-sm font-medium transition ${view === 'monthly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>
              Monthly</button>
          </div>

          {loading ? <Spinner /> : view === 'weekly' ? (
            <div className="space-y-2">
              {days.map((day) => (
                <button key={day.date} onClick={() => openDay(day)}
                  className="w-full text-left p-3 rounded-xl border border-gray-200 bg-white hover:shadow-sm transition">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{format(new Date(day.date + 'T00:00'), 'EEE, MMM d')}</span>
                    {renderDayBadges(day)}
                  </div>
                  {day.group_workout?.content ? (
                    <p className="text-sm text-gray-600 mt-1 truncate">{day.group_workout.content}</p>
                  ) : day.group_workout?.draft_content ? (
                    <p className="text-sm text-yellow-600 mt-1 truncate italic">{day.group_workout.draft_content}</p>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1 italic">No workout set</p>
                  )}
                </button>
              ))}
            </div>
          ) : renderMonthGrid()}
        </>
      )}

      {/* Workout edit modal */}
      <Modal open={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay ? format(new Date(selectedDay.date + 'T00:00'), 'EEEE, MMM d') : ''}>
        {selectedDay && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-green-700">Published (visible to athletes)</p>
                {published.trim() && <span className="w-2 h-2 rounded-full bg-green-400" />}
              </div>
              <textarea value={published} onChange={(e) => setPublished(e.target.value)}
                placeholder="Write the published workout..." rows={2}
                className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-green-50/50" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-yellow-700">Draft (only you can see)</p>
                {draft.trim() && <span className="w-2 h-2 rounded-full bg-yellow-400" />}
              </div>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a draft..." rows={2}
                className="w-full border border-yellow-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-yellow-50/50" />
              {draft.trim() && (
                <button onClick={() => handleSave({ content: draft, draft_content: '' })} disabled={saving}
                  className="mt-1.5 text-xs text-yellow-700 bg-yellow-100 rounded-lg px-3 py-1.5 hover:bg-yellow-200 disabled:opacity-50 font-medium">
                  Publish draft (replace published)</button>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => handleSave({ content: published, draft_content: draft })}
                disabled={saving || (!published.trim() && !draft.trim())}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}</button>
              <button onClick={() => setSelectedDay(null)}
                className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel</button>
            </div>
            {(selectedDay.group_workout?.content || selectedDay.group_workout?.draft_content) && (
              <button onClick={handleDelete} disabled={saving} className="w-full text-red-500 text-sm hover:underline">Delete all</button>
            )}
          </div>
        )}
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
    </div>
  );
}
