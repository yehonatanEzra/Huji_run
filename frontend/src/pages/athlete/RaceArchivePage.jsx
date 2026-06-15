import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { listRaces, listMyRaces } from '../../api/races';
import Spinner from '../../components/ui/Spinner';
import RaceCalendarView from './RaceCalendarView';

const TAB = 'flex-1 py-1.5 text-xs font-bold uppercase tracking-wider transition rounded-full';
const TAB_ACTIVE = 'bg-[#c0c1ff] text-[#1000a9]';
const TAB_INACTIVE = 'text-white/55 hover:text-white';
const TAB_ROW = 'flex gap-1 p-1 rounded-full mb-3 bg-[#1c1b1c]/50 backdrop-blur-xl border border-white/5';

export default function RaceArchivePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [races, setRaces] = useState([]);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('upcoming');
  const [scopeTab, setScopeTab] = useState('all');
  const [moderationTab, setModerationTab] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // list | calendar
  const isCoachOrAdmin = user?.role === 'coach' || user?.role === 'admin';

  useEffect(() => {
    setLoading(true);
    const params = moderationTab === 'drafts'
      ? { drafts: true }
      : { status: statusTab };
    if (search) params.search = search;
    if (year) params.year = parseInt(year);
    const fetcher = (scopeTab === 'my' && moderationTab !== 'drafts') ? listMyRaces : listRaces;
    fetcher(params)
      .then(({ data }) => setRaces(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, year, statusTab, scopeTab, moderationTab]);

  const years = [...new Set(races.map((r) => r.race_date.slice(0, 4)))].sort().reverse();

  return (
    <div>
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg-races.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: (user?.role === 'coach' || user?.role === 'admin') ? 'linear-gradient(180deg, rgba(19,19,20,0.43) 20%, rgba(0,0,0,0.54) 80%)' : 'linear-gradient(180deg, rgba(19,19,20,0.45) 20%, rgba(19,19,20,0.50) 80%)' }} />

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-[#e5e2e3]">Races</h2>
        {isCoachOrAdmin && (
          <button
            onClick={() => navigate('/coach/race-wizard')}
            style={{ boxShadow: '0 0 15px rgba(192,193,255,0.3)' }}
            className="bg-[#c0c1ff] text-[#1000a9] rounded-full px-4 py-1.5 text-sm font-bold hover:scale-[1.02] active:scale-95 transition"
          >
            + New race
          </button>
        )}
      </div>

      {/* List / Calendar view toggle */}
      <div className={TAB_ROW}>
        <button onClick={() => setViewMode('list')} className={`${TAB} ${viewMode === 'list' ? TAB_ACTIVE : TAB_INACTIVE}`}>List</button>
        <button onClick={() => setViewMode('calendar')} className={`${TAB} ${viewMode === 'calendar' ? TAB_ACTIVE : TAB_INACTIVE}`}>Calendar</button>
      </div>

      {viewMode === 'calendar' ? <RaceCalendarView /> : (
        <>

      {/* Coach / admin: All races vs My drafts */}
      {isCoachOrAdmin && (
        <div className={TAB_ROW}>
          <button onClick={() => setModerationTab('all')} className={`${TAB} ${moderationTab === 'all' ? TAB_ACTIVE : TAB_INACTIVE}`}>All races</button>
          <button onClick={() => setModerationTab('drafts')} className={`${TAB} ${moderationTab === 'drafts' ? TAB_ACTIVE : TAB_INACTIVE}`}>
            {user?.role === 'admin' ? 'All pending' : 'My drafts'}
          </button>
        </div>
      )}

      {/* Upcoming / Completed */}
      {moderationTab !== 'drafts' && (
        <div className={TAB_ROW}>
          <button onClick={() => setStatusTab('upcoming')} className={`${TAB} ${statusTab === 'upcoming' ? TAB_ACTIVE : TAB_INACTIVE}`}>Upcoming</button>
          <button onClick={() => setStatusTab('completed')} className={`${TAB} ${statusTab === 'completed' ? TAB_ACTIVE : TAB_INACTIVE}`}>Completed</button>
        </div>
      )}

      {/* My / All (compact pills) + year filter on one row */}
      {moderationTab !== 'drafts' && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex gap-1.5">
            {['my', 'all'].map((s) => (
              <button
                key={s}
                onClick={() => setScopeTab(s)}
                className={`px-4 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border transition ${
                  scopeTab === s ? 'bg-[#c0c1ff] text-[#1000a9] border-transparent' : 'bg-[#1c1b1c]/50 border-white/5 text-white/55 hover:text-white'
                }`}
              >{s}</button>
            ))}
          </div>
          <YearPicker year={year} years={years} onChange={setYear} />
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search races..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-[#1c1b1c]/50 border border-white/5 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/40 mb-4 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
      />

      {loading ? <Spinner /> : races.length === 0 ? (
        <p className="text-center text-white/60 py-8">
          {statusTab === 'upcoming' ? 'No upcoming races' : 'No races found'}
        </p>
      ) : (
        <div className="space-y-3">
          {races.map((race) => {
            const isPending = race.moderation_status === 'pending';
            const isRejected = race.moderation_status === 'rejected';
            return (
              <Link
                key={race.id}
                to={`/races/${race.id}`}
                className={`block rounded-2xl p-4 backdrop-blur-2xl border transition hover:brightness-125 active:scale-[0.99] ${
                  isPending ? 'bg-amber-500/15 border-amber-300/40' :
                  isRejected ? 'bg-red-500/15 border-red-300/40' :
                  'bg-[#201f20]/60 border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm text-white truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
                        {race.name || '(untitled)'}
                      </p>
                      {isPending && <span className="text-[10px] bg-amber-300/30 text-amber-200 font-semibold rounded-full px-2 py-0.5 border border-amber-300/40">Pending review</span>}
                      {isRejected && <span className="text-[10px] bg-red-300/30 text-red-200 font-semibold rounded-full px-2 py-0.5 border border-red-300/40">Rejected</span>}
                    </div>
                    <p className="text-xs text-white/60 mt-0.5">{race.race_date}</p>
                    {isRejected && race.decline_note && (
                      <p className="text-[11px] text-red-200 italic mt-1">"{race.decline_note}"</p>
                    )}
                  </div>
                  {race.status === 'upcoming' && !isPending && !isRejected && (
                    <span className="text-xs bg-white/20 text-white font-medium rounded-full px-2 py-0.5 whitespace-nowrap border border-white/25">
                      {race.registration_count} registered
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}

// Custom year dropdown — anchored right under the button (native <select>
// opens centered over the box, which we don't want).
function YearPicker({ year, years, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const options = [{ v: '', label: 'All years' }, ...years.map((y) => ({ v: y, label: y }))];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-[#1c1b1c]/50 border border-white/5 rounded-full px-4 py-1.5 text-xs text-white flex items-center gap-1.5 hover:text-white active:scale-95 transition"
      >
        {year || 'All years'}
        <span className="opacity-60 text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-[#1c1b1c] border border-white/10 rounded-xl shadow-2xl py-1 w-28 max-h-60 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.v}
              onClick={() => { onChange(opt.v); setOpen(false); }}
              className={`block w-full text-left px-3 py-1.5 text-xs transition ${
                year === opt.v ? 'bg-[#c0c1ff] text-[#1000a9] font-semibold' : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
