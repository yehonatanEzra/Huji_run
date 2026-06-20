import { useState, useEffect, useCallback } from 'react';
import { parseISO, format, getISOWeek, getISOWeekYear, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import {
  listGroups, getGroup, createGroup, renameGroup, deleteGroup,
  addMemberToGroup, removeMemberFromGroup, listAthletes,
  listPendingAdds, approveAdd, rejectAdd, getAthleteWeek,
} from '../../api/coach';
import {
  listGroupCoaches, searchCoaches, addGroupCoach, removeGroupCoach, transferGroupOwnership,
} from '../../api/groupCoach';
import { getTeamVolume, getTeamCompletion, getTypeBreakdown } from '../../api/analytics';
import { getReportingOverview, getLoadOverview } from '../../api/reporting';
import { getMyTeams, updateTeam } from '../../api/teams';
import GroupWorkoutsTab from './GroupWorkoutsTab';
import AthleteLogModal from '../../components/coach/AthleteLogModal';

const GLASS = 'bg-[#161616]/85 backdrop-blur-2xl border border-white/10';
const GLASS_INPUT = 'w-full bg-[#1c1b1c]/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20';
const TAB = 'flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition';
const TAB_ACTIVE = 'bg-[#c0c1ff] text-[#1000a9]';
const TAB_INACTIVE = 'text-white/55 hover:text-white';

function toIsoWeekStr(d) {
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
}

export default function GroupHubPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('workouts');
  const [showSettings, setShowSettings] = useState(false);

  const reload = useCallback(() => {
    return listGroups().then(({ data }) => {
      setGroups(data);
      setSelectedId((prev) => (prev && data.some((g) => g.id === prev) ? prev : data[0]?.id ?? null));
      return data;
    }).catch(() => setGroups([]));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (groups === null) {
    return (
      <>
        <HubBackground />
        <div className="flex justify-center py-20"><Spinner /></div>
      </>
    );
  }

  const selected = groups.find((g) => g.id === selectedId) || null;

  // Zero-group doorway
  if (groups.length === 0) {
    return (
      <>
        <HubBackground />
        <div className="flex flex-col items-center text-center pt-[18vh] px-6">
          <div className="w-16 h-16 rounded-2xl bg-[#c0c1ff]/10 border border-[#c0c1ff]/20 flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="#c0c1ff" strokeWidth={1.6} className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-1">No groups yet</h2>
          <p className="text-sm text-white/60 mb-5 max-w-xs">Create your first training group to start adding athletes, planning workouts, and seeing insights.</p>
          <CreateGroupButton onCreated={reload} />
        </div>
      </>
    );
  }

  return (
    <>
      <HubBackground />

      {/* Header: title + group selector + gear */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold text-[#e5e2e3]">Group</h2>
        <button
          onClick={() => setShowSettings(true)}
          aria-label="Group settings"
          className="w-9 h-9 rounded-full bg-[#1c1b1c]/60 border border-white/10 flex items-center justify-center text-white/70 hover:text-white active:scale-95 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
        </button>
      </div>

      {/* Group selector pills */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 mb-3">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => setSelectedId(g.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap border transition ${
              selectedId === g.id ? 'bg-[#c0c1ff] text-[#1000a9] border-transparent' : 'bg-[#1c1b1c]/60 border-white/10 text-white/60 hover:text-white'
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-full mb-4 ${GLASS}`}>
        {[['workouts', 'Workouts'], ['athletes', 'Athletes'], ['cocoaches', 'Staff'], ['insights', 'Insights']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`${TAB} ${tab === k ? TAB_ACTIVE : TAB_INACTIVE}`}>{label}</button>
        ))}
      </div>

      {selected && tab === 'workouts' && <GroupWorkoutsTab group={selected} />}
      {selected && tab === 'athletes' && <AthletesTab group={selected} onChanged={reload} groups={groups} />}
      {selected && tab === 'cocoaches' && <CoCoachesTab group={selected} />}
      {selected && tab === 'insights' && <InsightsTab group={selected} />}

      <Modal open={showSettings} onClose={() => setShowSettings(false)} panelClassName="bg-[#131314] border-t border-white/10">
        {selected && <SettingsPanel group={selected} onClose={() => setShowSettings(false)} onChanged={reload} />}
      </Modal>
    </>
  );
}

function HubBackground() {
  return (
    <>
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />
    </>
  );
}

// ── Athletes tab ──────────────────────────────────────────────────────────────
function AthletesTab({ group, onChanged, groups }) {
  const [detail, setDetail] = useState(null);
  const [pending, setPending] = useState([]);
  const [myAthletes, setMyAthletes] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);
  const [logAthlete, setLogAthlete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [weekDate, setWeekDate] = useState(new Date());
  const [weeks, setWeeks] = useState({}); // athleteId -> days[]
  const [weeksLoading, setWeeksLoading] = useState(false);
  const isMain = group.role === 'main';

  const load = useCallback(() => {
    getGroup(group.id).then(({ data }) => setDetail(data)).catch(() => setDetail(null));
    listPendingAdds(group.id).then(({ data }) => setPending(data)).catch(() => setPending([]));
    listAthletes().then(({ data }) => setMyAthletes(data)).catch(() => setMyAthletes([]));
  }, [group.id]);
  useEffect(() => { load(); }, [load]);

  // Per-member weekly grid (status + volume). getAthleteWeek works for any
  // group coach (main or assistant), unlike the personal-roster dashboard.
  useEffect(() => {
    if (!detail) return;
    const members = detail.members;
    if (members.length === 0) { setWeeks({}); return; }
    setWeeksLoading(true);
    const dayStr = format(weekDate, 'yyyy-MM-dd');
    Promise.all(members.map((m) =>
      getAthleteWeek(m.id, dayStr).then(({ data }) => [m.id, data.days]).catch(() => [m.id, null])
    )).then((entries) => setWeeks(Object.fromEntries(entries))).finally(() => setWeeksLoading(false));
  }, [detail, weekDate]);

  const handleApprove = async (rid) => { setBusy(true); try { await approveAdd(group.id, rid); load(); onChanged(); } finally { setBusy(false); } };
  const handleReject  = async (rid) => { setBusy(true); try { await rejectAdd(group.id, rid); load(); } finally { setBusy(false); } };
  const handleRemove = async (athleteId) => {
    if (!confirm('Remove from this group? They stay your athlete — just without a group.')) return;
    setBusy(true);
    try { await removeMemberFromGroup(group.id, athleteId); load(); onChanged(); } finally { setBusy(false); }
  };

  if (!detail) return <Spinner />;

  const memberIds = new Set(detail.members.map((m) => m.id));
  const pendingIds = new Set(pending.map((p) => p.athlete_id));
  const addable = myAthletes.filter((a) => !memberIds.has(a.id) && !pendingIds.has(a.id));

  const weekStart = startOfWeek(weekDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-4">
      {/* Pending approvals (main) / pending requests (assistant) */}
      {pending.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#c0c1ff] mb-2">
            {isMain ? 'Pending approvals' : 'Awaiting approval'}
          </p>
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.id} className={`${GLASS} rounded-xl px-4 py-2.5 flex items-center gap-2`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{p.athlete_name}</p>
                  <p className="text-[11px] text-white/45">requested by {p.requested_by_name}</p>
                </div>
                {isMain ? (
                  <div className="flex gap-1.5 shrink-0">
                    <button disabled={busy} onClick={() => handleApprove(p.id)} className="text-xs font-bold bg-[#c0c1ff] text-[#1000a9] px-3 py-1.5 rounded-lg disabled:opacity-40">Approve</button>
                    <button disabled={busy} onClick={() => handleReject(p.id)} className="text-xs text-red-300 border border-red-400/30 px-3 py-1.5 rounded-lg hover:bg-red-400/10 disabled:opacity-40">Reject</button>
                  </div>
                ) : (
                  <span className="text-[10px] font-semibold text-amber-200 bg-amber-400/15 border border-amber-400/25 rounded-full px-2.5 py-1 shrink-0">Pending main coach</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members — weekly tracking grid */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#c0c1ff]">Members · {detail.members.length}</p>
          <button onClick={() => setShowAdd(true)} className="text-xs font-bold bg-[#c0c1ff] text-[#1000a9] px-3 py-1 rounded-full hover:scale-[1.02] active:scale-95 transition">+ Add athlete</button>
        </div>
        {detail.members.length === 0 ? (
          <p className="text-sm text-white/45 italic py-4 text-center">No athletes in this group yet. Add one of your athletes above.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setWeekDate(subWeeks(weekDate, 1))} className="text-white hover:text-white/80 text-xs transition">&larr; Prev</button>
              <span className="text-xs font-medium text-white/70">
                {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d')}
              </span>
              <button onClick={() => setWeekDate(addWeeks(weekDate, 1))} className="text-white hover:text-white/80 text-xs transition">Next &rarr;</button>
            </div>
            <div className={`${GLASS} rounded-xl overflow-x-auto ${weeksLoading ? 'opacity-60' : ''} transition`}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-2 py-2 text-left text-white/55 font-semibold sticky left-0 z-10 bg-[#201f20] min-w-[120px]">Athlete</th>
                    {weekDays.map((d) => (
                      <th key={format(d, 'yyyy-MM-dd')} className="px-1 py-2 text-center text-white/55 font-semibold min-w-[40px]">{format(d, 'EEEEE')}</th>
                    ))}
                    <th className="px-2 py-2 text-center text-[#c0c1ff] font-semibold min-w-[44px]">km</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {detail.members.map((m) => {
                    const days = weeks[m.id];
                    const total = days ? days.reduce((s, d) => s + (d.log?.distance_km || 0), 0) : 0;
                    return (
                      <tr key={m.id} className="border-t border-white/[0.07]">
                        <td className="px-2 py-2 sticky left-0 z-10 bg-[#201f20]">
                          <button onClick={() => setLogAthlete(m)} className="text-left">
                            <span className="font-medium text-white hover:text-[#c0c1ff] transition truncate block max-w-[110px]">{m.full_name}</span>
                          </button>
                        </td>
                        {(days || Array(7).fill(null)).map((d, i) => (
                          <td key={d?.date || i} className="px-1 py-1.5 text-center">
                            <button onClick={() => setLogAthlete(m)} className="inline-flex items-center justify-center w-8 h-8 align-middle">
                              <DayDot day={d} />
                            </button>
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center">
                          {total > 0 ? <span className="font-bold text-[#c0c1ff]">{total.toFixed(1)}</span> : <span className="text-white/25">–</span>}
                        </td>
                        <td className="pr-1">
                          <MemberMenu onMove={() => setMoveTarget(m)} onRemove={() => handleRemove(m.id)} canMove={groups.length > 1} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} panelClassName="bg-[#131314] border-t border-white/10">
        <h3 className="text-base font-bold text-white mb-1">Add athlete</h3>
        <p className="text-xs text-white/50 mb-3">Only athletes you personally coach. {isMain ? 'Added immediately.' : 'Sent to the main coach for approval.'}</p>
        {addable.length === 0 ? (
          <p className="text-sm text-white/45 py-4 text-center">No eligible athletes — all of yours are already here or pending.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {addable.map((a) => (
              <AddRow key={a.id} athlete={a} groupId={group.id} onDone={() => { load(); onChanged(); }} />
            ))}
          </div>
        )}
      </Modal>

      {/* Move modal */}
      <Modal open={!!moveTarget} onClose={() => setMoveTarget(null)} panelClassName="bg-[#131314] border-t border-white/10">
        {moveTarget && (
          <MovePanel athlete={moveTarget} fromGroup={group} groups={groups}
            onClose={() => setMoveTarget(null)} onDone={() => { setMoveTarget(null); load(); onChanged(); }} />
        )}
      </Modal>

      {/* Athlete workout-log (expanded) */}
      {logAthlete && <AthleteLogModal athlete={logAthlete} onClose={() => setLogAthlete(null)} />}
    </div>
  );
}

// One day cell in the weekly grid: colored dot reflecting log status, with km
// (or V/~/X) inside. A periwinkle ring marks a race-day workout.
function DayDot({ day }) {
  if (!day) return <span className="inline-block w-8 h-8 rounded-full bg-white/[0.06]" />;
  const log = day.log;
  const isRace = day.target?.override_group
    ? day.target?.workout_type === 'race'
    : day.group_workout?.workout_type === 'race';
  let bg = 'bg-white/[0.06]', txt = 'text-white/25', text = '·';
  if (log) {
    const st = log.status || (log.completed ? 'completed' : 'missed');
    bg = st === 'completed' ? 'bg-emerald-400/25' : st === 'partial' ? 'bg-amber-400/25' : 'bg-red-400/25';
    txt = st === 'completed' ? 'text-emerald-100' : st === 'partial' ? 'text-amber-100' : 'text-red-100';
    if (log.distance_km > 0) text = log.distance_km < 10 ? log.distance_km.toFixed(1) : Math.round(log.distance_km).toString();
    else text = st === 'completed' ? 'V' : st === 'partial' ? '~' : 'X';
  }
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-[10px] ${bg} ${txt} hover:ring-2 hover:ring-[#c0c1ff]/50 transition ${isRace ? 'ring-2 ring-[#c0c1ff]' : ''}`}>
      {text}
    </span>
  );
}

function AddRow({ athlete, groupId, onDone }) {
  const [state, setState] = useState('idle'); // idle | added | pending
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const { data } = await addMemberToGroup(groupId, athlete.id);
      setState(data.status === 'pending' ? 'pending' : 'added');
      if (data.status === 'added') onDone();
    } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03]">
      <span className="flex-1 text-sm text-white truncate">{athlete.full_name}</span>
      {state === 'idle' ? (
        <button disabled={busy} onClick={add} className="text-xs font-bold bg-[#c0c1ff] text-[#1000a9] px-3 py-1 rounded-full disabled:opacity-40">{busy ? '…' : 'Add'}</button>
      ) : state === 'pending' ? (
        <span className="text-[10px] font-semibold text-amber-200">Pending</span>
      ) : (
        <span className="text-[10px] font-semibold text-emerald-300">Added ✓</span>
      )}
    </div>
  );
}

function MemberMenu({ onMove, onRemove, canMove }) {
  // Bottom-sheet rather than an absolute dropdown — the grid's overflow-x-auto
  // container would otherwise clip a dropdown.
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="w-8 h-8 rounded-full text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition">⋯</button>
      <Modal open={open} onClose={() => setOpen(false)} panelClassName="bg-[#131314] border-t border-white/10">
        <div className="space-y-2">
          {canMove && <button onClick={() => { setOpen(false); onMove(); }} className="w-full text-left px-4 py-3 rounded-xl bg-white/[0.04] text-sm text-white/85 hover:bg-white/10 transition">Move to another group →</button>}
          <button onClick={() => { setOpen(false); onRemove(); }} className="w-full text-left px-4 py-3 rounded-xl bg-white/[0.04] text-sm text-red-300 hover:bg-white/10 transition">Remove from group</button>
        </div>
      </Modal>
    </>
  );
}

function MovePanel({ athlete, fromGroup, groups, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const targets = groups.filter((g) => g.id !== fromGroup.id);
  const move = async (toId) => {
    setBusy(true); setMsg('');
    try {
      const { data } = await addMemberToGroup(toId, athlete.id); // single-group → moves them
      if (data.status === 'pending') { setMsg('Sent to that group’s main coach for approval.'); }
      else { onDone(); }
    } catch (e) {
      setMsg(e?.response?.data?.detail || 'Could not move (are you their coach in that group?)');
    } finally { setBusy(false); }
  };
  return (
    <div>
      <h3 className="text-base font-bold text-white mb-1">Move {athlete.full_name}</h3>
      <p className="text-xs text-white/50 mb-3">From “{fromGroup.name}” to:</p>
      <div className="space-y-1.5">
        {targets.map((g) => (
          <button key={g.id} disabled={busy} onClick={() => move(g.id)} className={`${GLASS} w-full text-left rounded-xl px-4 py-2.5 text-sm text-white hover:bg-white/[0.06] disabled:opacity-40`}>{g.name}</button>
        ))}
      </div>
      {msg && <p className="text-xs text-amber-200 mt-3">{msg}</p>}
      <button onClick={onClose} className="mt-4 w-full text-sm text-white/50 hover:text-white">Cancel</button>
    </div>
  );
}

// ── Co-coaches tab (ported from GroupCoachPage) ───────────────────────────────
function CoCoachesTab({ group }) {
  const { user } = useAuth();
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState([]);
  const [transferTarget, setTransferTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listGroupCoaches(group.id).then(({ data }) => setCoaches(data)).catch(() => setCoaches([])).finally(() => setLoading(false));
  }, [group.id]);
  useEffect(() => { load(); }, [load]);

  const isMain = coaches.some((c) => c.user_id === user?.id && c.role === 'main');

  useEffect(() => {
    if (!searchQ.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      searchCoaches(searchQ).then(({ data }) => {
        const have = new Set(coaches.map((c) => c.user_id));
        setResults(data.filter((u) => !have.has(u.id)));
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, coaches]);

  const add = async (u) => { setBusy(true); try { await addGroupCoach(group.id, u.id, 'assistant'); setSearchQ(''); setResults([]); setAddOpen(false); load(); } finally { setBusy(false); } };
  const remove = async (c) => { if (!confirm(`Remove ${c.full_name} as assistant?`)) return; await removeGroupCoach(group.id, c.user_id); load(); };
  const transfer = async () => { if (!transferTarget) return; setBusy(true); try { await transferGroupOwnership(group.id, transferTarget.user_id); setTransferOpen(false); setTransferTarget(null); load(); } finally { setBusy(false); } };

  if (loading) return <Spinner />;

  const assistants = coaches.filter((c) => c.role === 'assistant');

  return (
    <div className="space-y-2">
      {coaches.map((c) => (
        <div key={c.user_id} className={`${GLASS} rounded-xl px-4 py-2.5 flex items-center gap-2`}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{c.full_name}</p>
            <p className="text-[11px] text-white/40">@{c.username}</p>
          </div>
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${c.role === 'main' ? 'bg-[#c0c1ff]/20 text-[#c0c1ff]' : 'bg-white/10 text-white/60'}`}>{c.role === 'main' ? 'Main coach' : 'Assistant'}</span>
          {isMain && c.role === 'assistant' && (
            <button onClick={() => remove(c)} className="text-xs text-red-300 hover:text-red-200 ml-1">Remove</button>
          )}
        </div>
      ))}
      {assistants.length === 0 && (
        <p className="text-sm text-white/45 italic py-3 text-center">You're coaching solo. Add an assistant to share the group.</p>
      )}

      {isMain && (
        <div className="flex gap-2 pt-1">
          <button onClick={() => setAddOpen(true)} className="flex-1 bg-[#c0c1ff] text-[#1000a9] rounded-xl py-2 text-sm font-bold">Add assistant coach</button>
          {assistants.length > 0 && (
            <button onClick={() => setTransferOpen(true)} className="flex-1 border border-white/15 text-white/80 rounded-xl py-2 text-sm font-medium hover:bg-white/5">Transfer ownership</button>
          )}
        </div>
      )}

      <Modal open={addOpen} onClose={() => { setAddOpen(false); setSearchQ(''); setResults([]); }} panelClassName="bg-[#131314] border-t border-white/10">
        <h3 className="text-base font-bold text-white mb-3">Add assistant coach</h3>
        <input autoFocus value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search by name or email…" className={`${GLASS_INPUT} mb-2`} />
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {results.map((u) => (
            <div key={u.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5">
              <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{u.full_name}</p><p className="text-[11px] text-white/40">@{u.username}</p></div>
              <button disabled={busy} onClick={() => add(u)} className="text-xs font-bold bg-[#c0c1ff] text-[#1000a9] px-3 py-1 rounded-full disabled:opacity-40">Add</button>
            </div>
          ))}
          {searchQ && results.length === 0 && <p className="text-xs text-white/40 text-center py-2">No coaches found</p>}
        </div>
      </Modal>

      <Modal open={transferOpen} onClose={() => { setTransferOpen(false); setTransferTarget(null); }} panelClassName="bg-[#131314] border-t border-white/10">
        <h3 className="text-base font-bold text-white mb-1">Transfer main coach role</h3>
        <p className="text-xs text-white/50 mb-3">You'll become an assistant. This needs the new main coach to transfer it back.</p>
        <div className="space-y-1.5 mb-4">
          {assistants.map((c) => (
            <button key={c.user_id} onClick={() => setTransferTarget(c)} className={`w-full text-left px-3 py-2 rounded-xl border text-sm transition ${transferTarget?.user_id === c.user_id ? 'border-[#c0c1ff] bg-[#c0c1ff]/10 text-white' : 'border-white/10 text-white/70 hover:border-white/25'}`}>{c.full_name}</button>
          ))}
        </div>
        <button disabled={!transferTarget || busy} onClick={transfer} className="w-full bg-red-500/80 hover:bg-red-500 text-white rounded-xl py-2 text-sm font-bold disabled:opacity-40">Confirm transfer</button>
      </Modal>
    </div>
  );
}

// ── Insights tab (analytics + reporting, scoped to the selected group) ────────
function InsightsTab({ group }) {
  const [view, setView] = useState('reporting'); // reporting | load | analytics
  return (
    <div>
      <p className="text-[11px] text-white/40 mb-3">Showing: <span className="text-white/70 font-medium">{group.name}</span></p>
      <div className={`flex gap-1 p-1 rounded-full mb-4 ${GLASS}`}>
        {[['reporting', 'Logging'], ['load', 'Load'], ['analytics', 'Analytics']].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} className={`${TAB} ${view === k ? TAB_ACTIVE : TAB_INACTIVE}`}>{label}</button>
        ))}
      </div>
      {view === 'reporting' && <ReportingView group={group} mode="reporting" />}
      {view === 'load' && <ReportingView group={group} mode="load" />}
      {view === 'analytics' && <AnalyticsView group={group} />}
    </div>
  );
}

function ReportingView({ group, mode }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const week = toIsoWeekStr(new Date());
  useEffect(() => {
    setLoading(true);
    const params = { week, group_id: group.id };
    const req = mode === 'load' ? getLoadOverview(params) : getReportingOverview(params);
    req.then(({ data }) => setData(data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [group.id, mode]);

  if (loading) return <Spinner />;
  if (!data) return <p className="text-sm text-white/45 py-6 text-center">Failed to load.</p>;

  if (mode === 'load') {
    if (data.athletes.length === 0) return <p className="text-sm text-white/45 py-6 text-center">No athletes in this group.</p>;
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-white/40">Spike = this week &gt;{data.threshold_pct}% over baseline · {data.athletes.filter((a) => a.is_spike).length} flagged</p>
        {data.athletes.map((a) => (
          <div key={a.user_id} className={`${GLASS} rounded-xl px-4 py-2.5 ${a.is_spike ? 'border-red-400/40' : ''}`}>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm font-semibold text-white truncate">{a.is_spike && '⚠️ '}{a.full_name}</p>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-white">{a.current_week_km} km</p>
                {a.spike_pct !== null ? <p className={`text-[11px] ${a.is_spike ? 'text-red-300' : 'text-white/40'}`}>{a.spike_pct > 0 ? '+' : ''}{a.spike_pct}% vs {a.avg_prev_km}</p> : <p className="text-[11px] text-white/40">no baseline</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (data.athletes.length === 0) return <p className="text-sm text-white/45 py-6 text-center">No athletes in this group.</p>;
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-white/40">{data.week_start} – {data.week_end}</p>
      {data.athletes.map((a) => (
        <div key={a.user_id} className={`${GLASS} rounded-xl px-4 py-2.5 flex items-center gap-3`}>
          <p className="flex-1 text-sm font-semibold text-white truncate">{a.full_name}</p>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-white">{a.days_logged}/{a.total_days}</p>
            <p className="text-[11px] text-white/40">{Math.round(a.response_rate * 100)}%</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AnalyticsView({ group }) {
  const [volume, setVolume] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const params = { group_id: group.id };
    Promise.all([getTeamVolume(params), getTeamCompletion(params), getTypeBreakdown(params)])
      .then(([v, c, b]) => { setVolume(v.data); setCompletion(c.data); setBreakdown(b.data); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [group.id]);

  if (loading) return <Spinner />;
  if (!volume) return <p className="text-sm text-white/45 py-6 text-center">Not enough data yet.</p>;

  return (
    <div className="space-y-4">
      <div className={`${GLASS} rounded-2xl p-4`}>
        <h3 className="text-sm font-semibold text-white mb-3">Weekly volume (total km)</h3>
        <DarkBars buckets={volume.buckets} valueKey="total_km" color="#c0c1ff" />
        <p className="text-[11px] text-white/40 mt-2">{volume.athlete_count} athletes</p>
      </div>
      <div className={`${GLASS} rounded-2xl p-4`}>
        <h3 className="text-sm font-semibold text-white mb-3">Logging completion</h3>
        <DarkBars buckets={completion.buckets} valueKey="rate" color="#34d399" asPercent />
      </div>
      <div className={`${GLASS} rounded-2xl p-4`}>
        <h3 className="text-sm font-semibold text-white mb-1">Planned workout types</h3>
        <p className="text-[11px] text-white/40 mb-3">Last {breakdown.days} days · {breakdown.total} workouts</p>
        {breakdown.total === 0 ? <p className="text-sm text-white/45">No workouts planned.</p> : <TypeBars breakdown={breakdown} />}
      </div>
    </div>
  );
}

const TYPE_COLORS = { simple: '#9ca3af', easy: '#34d399', rest: '#94a3b8', tempo: '#fb923c', long: '#a78bfa', intervals: '#f87171', fartlek: '#f472b6', race: '#818cf8' };
const TYPE_LABEL = { simple: 'Other', easy: 'Easy', rest: 'Rest', tempo: 'Tempo', long: 'Long', intervals: 'Intervals', fartlek: 'Fartlek', race: 'Race' };

function DarkBars({ buckets, valueKey, color, asPercent = false }) {
  const max = Math.max(...buckets.map((b) => b[valueKey]), asPercent ? 1 : 0.0001);
  return (
    <div className="flex items-end gap-0.5 h-32">
      {buckets.map((b, i) => (
        <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-1">
          <div className="w-full rounded-t" style={{ height: `${(b[valueKey] / max) * 100}%`, minHeight: b[valueKey] > 0 ? '3px' : '0', backgroundColor: color }} title={`${b.label}: ${asPercent ? Math.round(b[valueKey] * 100) + '%' : b[valueKey]}`} />
          <span className="text-[7px] text-white/40">{format(parseISO(b.start), 'd')}</span>
        </div>
      ))}
    </div>
  );
}

function TypeBars({ breakdown }) {
  return (
    <div className="space-y-2">
      <div className="flex h-4 rounded-full overflow-hidden">
        {breakdown.slices.map((s) => (
          <div key={s.workout_type} style={{ width: `${(s.count / breakdown.total) * 100}%`, backgroundColor: TYPE_COLORS[s.workout_type] || '#9ca3af' }} title={`${TYPE_LABEL[s.workout_type] || s.workout_type}: ${s.count}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {breakdown.slices.map((s) => (
          <div key={s.workout_type} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: TYPE_COLORS[s.workout_type] || '#9ca3af' }} />
            <span className="flex-1 truncate text-white/70">{TYPE_LABEL[s.workout_type] || s.workout_type}</span>
            <span className="text-white/40">{s.count} ({Math.round((s.count / breakdown.total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Settings panel (gear) ─────────────────────────────────────────────────────
function SettingsPanel({ group, onClose, onChanged }) {
  const [name, setName] = useState(group.name);
  const [busy, setBusy] = useState(false);
  const isMain = group.role === 'main';

  const save = async () => { if (!name.trim()) return; setBusy(true); try { await renameGroup(group.id, name.trim()); onChanged(); onClose(); } finally { setBusy(false); } };
  const del = async () => {
    if (!confirm(`Delete “${group.name}”? Members become group-less (they stay your athletes).`)) return;
    setBusy(true);
    try { await deleteGroup(group.id); onChanged(); onClose(); } finally { setBusy(false); }
  };

  return (
    <div>
      <h3 className="text-base font-bold text-white mb-4">Group settings</h3>
      {isMain ? (
        <>
          <label className="text-[11px] uppercase tracking-widest text-white/50 font-semibold">Name</label>
          <div className="flex gap-2 mt-1 mb-5">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} className={GLASS_INPUT} />
            <button disabled={busy} onClick={save} className="bg-[#c0c1ff] text-[#1000a9] text-sm px-4 rounded-xl font-bold disabled:opacity-40">Save</button>
          </div>
          <button disabled={busy} onClick={del} className="w-full border border-red-400/30 text-red-300 rounded-xl py-2 text-sm font-medium hover:bg-red-400/10">Delete group</button>
        </>
      ) : (
        <p className="text-sm text-white/50">Only the main coach can rename or delete this group.</p>
      )}
      <div className="mt-6 pt-4 border-t border-white/10">
        <TeamPublicSection />
      </div>

      <div className="mt-6 pt-4 border-t border-white/10">
        <CreateGroupButton onCreated={() => { onChanged(); onClose(); }} />
      </div>
    </div>
  );
}

function TeamPublicSection() {
  const { user } = useAuth();
  const teamId = user?.active_team_id;
  const [isPublic, setIsPublic] = useState(null); // null = loading/unknown
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    getMyTeams()
      .then(({ data }) => {
        const t = (data || []).find((x) => x.id === teamId);
        setIsPublic(t ? !!t.is_public : false);
      })
      .catch(() => setIsPublic(false));
  }, [teamId]);

  const toggle = async () => {
    if (busy || isPublic === null) return;
    setBusy(true);
    try {
      const { data } = await updateTeam(teamId, { is_public: !isPublic });
      setIsPublic(!!data.is_public);
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not update');
    } finally {
      setBusy(false);
    }
  };

  const link = `${window.location.origin}/t/${teamId}`;
  const copy = () => {
    navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  if (!teamId) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Public team profile</p>
          <p className="text-[11px] text-white/45">A shareable page anyone can view (no login).</p>
        </div>
        <button
          onClick={toggle}
          disabled={busy || isPublic === null}
          className={`shrink-0 w-12 h-7 rounded-full transition relative disabled:opacity-50 ${isPublic ? 'bg-[#c0c1ff]' : 'bg-white/15'}`}
          aria-pressed={!!isPublic}
        >
          <span className={`absolute top-0.5 ${isPublic ? 'left-6' : 'left-0.5'} w-6 h-6 rounded-full bg-white transition-all`} />
        </button>
      </div>

      {isPublic && (
        <div className="mt-3 flex items-center gap-2">
          <input readOnly value={link} className={`${GLASS_INPUT} text-[11px]`} onFocus={(e) => e.target.select()} />
          <button onClick={copy} className="shrink-0 bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-semibold px-3 py-2 rounded-xl transition">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}

function CreateGroupButton({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => { if (!name.trim()) return; setBusy(true); try { await createGroup(name.trim()); setName(''); setOpen(false); onCreated(); } finally { setBusy(false); } };
  if (!open) return <button onClick={() => setOpen(true)} className="w-full bg-[#c0c1ff] text-[#1000a9] rounded-xl py-2.5 text-sm font-bold hover:scale-[1.01] active:scale-95 transition">+ Create group</button>;
  return (
    <div className="flex gap-2">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Group name…" className={GLASS_INPUT} onKeyDown={(e) => e.key === 'Enter' && create()} />
      <button disabled={busy} onClick={create} className="bg-[#c0c1ff] text-[#1000a9] text-sm px-4 rounded-xl font-bold disabled:opacity-40">Create</button>
    </div>
  );
}
