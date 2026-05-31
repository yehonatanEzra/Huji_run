import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { listRaces, listMyRaces } from '../../api/races';
import Spinner from '../../components/ui/Spinner';

export default function RaceArchivePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [races, setRaces] = useState([]);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('upcoming');
  const [scopeTab, setScopeTab] = useState('all');
  // 'all' = approved + my drafts mixed (default); 'drafts' = only my pending/rejected
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Races</h2>
        {isCoachOrAdmin && (
          <button
            onClick={() => navigate('/coach/race-wizard')}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            + New Race
          </button>
        )}
      </div>

      {/* Coach / admin only: All races vs. My drafts (pending/rejected) */}
      {isCoachOrAdmin && (
        <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3 text-sm">
          <button
            onClick={() => setModerationTab('all')}
            className={`flex-1 py-2 font-medium transition ${moderationTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}
          >All races</button>
          <button
            onClick={() => setModerationTab('drafts')}
            className={`flex-1 py-2 font-medium transition ${moderationTab === 'drafts' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}
          >{user?.role === 'admin' ? 'All pending' : 'My drafts'}</button>
        </div>
      )}

      {/* Top-level: Upcoming / Completed (drafts mode ignores this) */}
      {moderationTab !== 'drafts' && (
      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3">
        <button
          onClick={() => setStatusTab('upcoming')}
          className={`flex-1 py-2 text-sm font-medium transition ${statusTab === 'upcoming' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
        >Upcoming</button>
        <button
          onClick={() => setStatusTab('completed')}
          className={`flex-1 py-2 text-sm font-medium transition ${statusTab === 'completed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
        >Completed</button>
      </div>
      )}

      {/* Sub-filter: My / All — hidden in drafts mode */}
      {moderationTab !== 'drafts' && (
      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4 text-xs">
        <button
          onClick={() => setScopeTab('my')}
          className={`flex-1 py-1 font-medium transition ${scopeTab === 'my' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500'}`}
        >My</button>
        <button
          onClick={() => setScopeTab('all')}
          className={`flex-1 py-1 font-medium transition ${scopeTab === 'all' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500'}`}
        >All</button>
      </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search races..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : races.length === 0 ? (
        <p className="text-center text-gray-400 py-8">
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
                className={`block border rounded-xl p-4 hover:shadow-sm transition ${
                  isPending ? 'bg-amber-50 border-amber-200' :
                  isRejected ? 'bg-red-50 border-red-200' :
                  'bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{race.name || '(untitled)'}</p>
                      {isPending && <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold rounded-full px-2 py-0.5">Pending review</span>}
                      {isRejected && <span className="text-[10px] bg-red-100 text-red-800 font-semibold rounded-full px-2 py-0.5">Rejected</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{race.race_date}</p>
                    {isRejected && race.decline_note && (
                      <p className="text-[11px] text-red-700 italic mt-1">"{race.decline_note}"</p>
                    )}
                  </div>
                  {race.status === 'upcoming' && !isPending && !isRejected && (
                    <span className="text-xs bg-blue-50 text-blue-700 font-medium rounded-full px-2 py-0.5 whitespace-nowrap">
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
