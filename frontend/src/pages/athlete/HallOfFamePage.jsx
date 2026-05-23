import { useState, useEffect } from 'react';
import { getHallOfFame, getHofGroups, getKmLeaders } from '../../api/leaderboard';
import Tabs from '../../components/ui/Tabs';
import Spinner from '../../components/ui/Spinner';

const DISTANCE_LABELS = {
  1500: '1,500m',
  3000: '3,000m',
  5000: '5,000m',
  10000: '10,000m',
  21100: 'Half Marathon',
  42200: 'Marathon',
};

const MEDAL = ['🥇', '🥈', '🥉'];

export default function HallOfFamePage() {
  const [data, setData] = useState(null);
  const [gender, setGender] = useState('men');
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [kmLeaders, setKmLeaders] = useState(null);

  useEffect(() => {
    getHofGroups()
      .then(({ data }) => setGroups(data))
      .catch(console.error);
    getKmLeaders()
      .then(({ data }) => setKmLeaders(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    getHallOfFame(selectedGroup)
      .then(({ data }) => setData(data.distances))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedGroup]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Hall of Fame</h2>

      {groups.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-2">
          <button
            onClick={() => setSelectedGroup(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              selectedGroup === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Overall
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroup(g.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                selectedGroup === g.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      <Tabs
        tabs={[{ value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }]}
        active={gender}
        onChange={setGender}
      />

      {kmLeaders && (kmLeaders.weekly.length > 0 || kmLeaders.monthly.length > 0) && (
        <div className="space-y-4 mb-6">
          {[
            { title: `Weekly km (${kmLeaders.week_start})`, entries: kmLeaders.weekly },
            { title: `Monthly km (${kmLeaders.month})`, entries: kmLeaders.monthly },
          ].map(({ title, entries }) => entries.length > 0 && (
            <div key={title} className="bg-white rounded-xl border p-4">
              <h3 className="text-sm font-semibold text-gray-600 mb-3">{title}</h3>
              <div className="space-y-2">
                {entries.map((e) => (
                  <div key={e.rank} className="flex items-center gap-3 p-2 rounded-lg bg-blue-50">
                    <span className="text-2xl">{MEDAL[e.rank - 1] || `#${e.rank}`}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{e.athlete_name}</p>
                    </div>
                    <span className="font-bold text-sm text-blue-800">{e.total_km} km</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? <Spinner /> : !data ? (
        <p className="text-center text-gray-500">Failed to load</p>
      ) : (
        <div className="space-y-6">
          {data.map((dist) => {
            const entries = gender === 'men' ? dist.men : dist.women;
            return (
              <div key={dist.distance_m} className="bg-white rounded-xl border p-4">
                <h3 className="text-sm font-semibold text-gray-600 mb-3">
                  {DISTANCE_LABELS[dist.distance_m] || `${dist.distance_m}m`}
                </h3>
                {entries.length === 0 ? (
                  <p className="text-sm text-gray-400">No records yet</p>
                ) : (
                  <div className="space-y-2">
                    {entries.map((e) => (
                      <div key={e.rank} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                        <span className="text-2xl">{MEDAL[e.rank - 1]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{e.athlete_name}</p>
                          <p className="text-xs text-gray-500">{e.achieved_date}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold text-sm">{e.time_display}</p>
                          <p className="text-xs text-gray-500">{e.pace_display} /km</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
