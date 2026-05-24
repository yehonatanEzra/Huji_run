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

  useEffect(() => {
    setLoading(true);
    const params = { status: statusTab };
    if (search) params.search = search;
    if (year) params.year = parseInt(year);
    const fetcher = scopeTab === 'my' ? listMyRaces : listRaces;
    fetcher(params)
      .then(({ data }) => setRaces(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, year, statusTab, scopeTab]);

  const years = [...new Set(races.map((r) => r.race_date.slice(0, 4)))].sort().reverse();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Races</h2>
        {user?.role === 'coach' && (
          <button
            onClick={() => navigate('/coach/race-wizard')}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            + New Race
          </button>
        )}
      </div>

      {/* Top-level: Upcoming / Completed */}
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

      {/* Sub-filter: My / All */}
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
          {races.map((race) => (
            <Link
              key={race.id}
              to={`/races/${race.id}`}
              className="block bg-white border rounded-xl p-4 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{race.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{race.race_date}</p>
                </div>
                {race.status === 'upcoming' && (
                  <span className="text-xs bg-blue-50 text-blue-700 font-medium rounded-full px-2 py-0.5 whitespace-nowrap">
                    {race.registration_count} registered
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
