import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { listRaces, listMyRaces } from '../../api/races';
import Spinner from '../../components/ui/Spinner';
import PageBackground from '../../components/PageBackground';

const TAB = 'flex-1 py-2 text-sm font-semibold transition';
const TAB_ACTIVE = 'bg-white text-black';
const TAB_INACTIVE = 'text-white/60 hover:text-white';

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
      <PageBackground src="/bg-races.jpg" />

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">Races</h2>
        {isCoachOrAdmin && (
          <button
            onClick={() => navigate('/coach/race-wizard')}
            className="bg-white text-black rounded-xl px-4 py-2 text-sm font-semibold hover:bg-white/80 transition active:scale-95"
          >
            + New Race
          </button>
        )}
      </div>

      {/* Coach / admin: All races vs My drafts */}
      {isCoachOrAdmin && (
        <div className="flex rounded-xl overflow-hidden mb-3 bg-white/10 backdrop-blur-sm border border-white/20">
          <button onClick={() => setModerationTab('all')} className={`${TAB} ${moderationTab === 'all' ? TAB_ACTIVE : TAB_INACTIVE}`}>All races</button>
          <button onClick={() => setModerationTab('drafts')} className={`${TAB} ${moderationTab === 'drafts' ? TAB_ACTIVE : TAB_INACTIVE}`}>
            {user?.role === 'admin' ? 'All pending' : 'My drafts'}
          </button>
        </div>
      )}

      {/* Upcoming / Completed */}
      {moderationTab !== 'drafts' && (
        <div className="flex rounded-xl overflow-hidden mb-3 bg-white/10 backdrop-blur-sm border border-white/20">
          <button onClick={() => setStatusTab('upcoming')} className={`${TAB} ${statusTab === 'upcoming' ? TAB_ACTIVE : TAB_INACTIVE}`}>Upcoming</button>
          <button onClick={() => setStatusTab('completed')} className={`${TAB} ${statusTab === 'completed' ? TAB_ACTIVE : TAB_INACTIVE}`}>Completed</button>
        </div>
      )}

      {/* My / All */}
      {moderationTab !== 'drafts' && (
        <div className="flex rounded-xl overflow-hidden mb-4 bg-white/10 backdrop-blur-sm border border-white/20">
          <button onClick={() => setScopeTab('my')} className={`${TAB} text-xs py-1 ${scopeTab === 'my' ? TAB_ACTIVE : TAB_INACTIVE}`}>My</button>
          <button onClick={() => setScopeTab('all')} className={`${TAB} text-xs py-1 ${scopeTab === 'all' ? TAB_ACTIVE : TAB_INACTIVE}`}>All</button>
        </div>
      )}

      {/* Search + year filter */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search races..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
        />
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
        >
          <option value="" className="text-black">All Years</option>
          {years.map((y) => <option key={y} value={y} className="text-black">{y}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : races.length === 0 ? (
        <p className="text-center text-white/60 py-8">
          {statusTab === 'upcoming' ? 'No upcoming races' : 'No races found'}
        </p>
      ) : (
        <div className="space-y-2">
          {races.map((race) => {
            const isPending = race.moderation_status === 'pending';
            const isRejected = race.moderation_status === 'rejected';
            return (
              <Link
                key={race.id}
                to={`/races/${race.id}`}
                className={`block rounded-xl p-4 backdrop-blur-sm border transition hover:scale-[1.01] active:scale-[0.99] ${
                  isPending ? 'bg-amber-300/20 border-amber-300/40' :
                  isRejected ? 'bg-red-300/20 border-red-300/40' :
                  'bg-white/20 border-white/30 hover:bg-white/28'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm text-white truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
                        🏁 {race.name || '(untitled)'}
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
    </div>
  );
}
