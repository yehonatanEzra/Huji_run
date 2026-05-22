import { useState, useEffect } from 'react';
import { getHallOfFame } from '../../api/leaderboard';
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

  useEffect(() => {
    getHallOfFame()
      .then(({ data }) => setData(data.distances))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data) return <p className="text-center text-gray-500">Failed to load</p>;

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Hall of Fame</h2>
      <Tabs
        tabs={[{ value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }]}
        active={gender}
        onChange={setGender}
      />

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
    </div>
  );
}
