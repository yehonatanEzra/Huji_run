import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getRace, getRaceResults, getRaceLeaderboard } from '../../api/races';
import Tabs from '../../components/ui/Tabs';
import Spinner from '../../components/ui/Spinner';

const DISTANCE_LABELS = {
  1500: '1,500m', 3000: '3,000m', 5000: '5,000m',
  10000: '10,000m', 21100: 'Half Marathon', 42200: 'Marathon',
};

export default function RaceDetailPage() {
  const { raceId } = useParams();
  const [race, setRace] = useState(null);
  const [tab, setTab] = useState('heats');
  const [selectedDist, setSelectedDist] = useState(null);
  const [heatResults, setHeatResults] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRace(raceId)
      .then(({ data }) => {
        setRace(data);
        const distances = [...new Set(data.heats.map((h) => h.distance_m))];
        if (distances.length > 0) setSelectedDist(distances[0]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [raceId]);

  useEffect(() => {
    if (!selectedDist) return;
    if (tab === 'heats') {
      getRaceResults(raceId, selectedDist)
        .then(({ data }) => setHeatResults(data))
        .catch(console.error);
    } else {
      getRaceLeaderboard(raceId, selectedDist)
        .then(({ data }) => setLeaderboard(data))
        .catch(console.error);
    }
  }, [raceId, selectedDist, tab]);

  if (loading) return <Spinner />;
  if (!race) return <p className="text-gray-500">Race not found</p>;

  const distances = [...new Set(race.heats.map((h) => h.distance_m))];

  return (
    <div>
      <h2 className="text-xl font-bold">{race.name}</h2>
      <p className="text-sm text-gray-500 mb-4">{race.race_date}</p>

      <Tabs
        tabs={[{ value: 'heats', label: 'Heat Results' }, { value: 'leaderboard', label: 'Leaderboard' }]}
        active={tab}
        onChange={setTab}
      />

      {distances.length > 1 && (
        <Tabs
          tabs={distances.map((d) => ({ value: d, label: DISTANCE_LABELS[d] || `${d}m` }))}
          active={selectedDist}
          onChange={setSelectedDist}
        />
      )}

      {tab === 'heats' ? (
        <div className="space-y-4">
          {heatResults.map((hw) => (
            <div key={hw.heat.id} className="bg-white border rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b">
                <p className="text-sm font-semibold">{hw.heat.label}</p>
                <p className="text-xs text-gray-500">{DISTANCE_LABELS[hw.heat.distance_m]}</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="px-3 py-1.5 text-left w-8">#</th>
                    <th className="px-3 py-1.5 text-left">Name</th>
                    <th className="px-3 py-1.5 text-right">Time</th>
                    <th className="px-3 py-1.5 text-right">Pace</th>
                  </tr>
                </thead>
                <tbody>
                  {hw.results.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{r.placement}</td>
                      <td className="px-3 py-2">{r.athlete_name}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.time_display}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{r.pace_display}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : leaderboard ? (
        <div className="space-y-4">
          {[{ label: 'Men', data: leaderboard.men }, { label: 'Women', data: leaderboard.women }].map(({ label, data }) => (
            <div key={label} className="bg-white border rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b">
                <p className="text-sm font-semibold">{label}</p>
              </div>
              {data.length === 0 ? (
                <p className="text-sm text-gray-400 p-3">No results</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="px-3 py-1.5 text-left w-8">#</th>
                      <th className="px-3 py-1.5 text-left">Name</th>
                      <th className="px-3 py-1.5 text-right">Time</th>
                      <th className="px-3 py-1.5 text-right">Pace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 font-medium">{r.placement}</td>
                        <td className="px-3 py-2">{r.athlete_name}</td>
                        <td className="px-3 py-2 text-right font-mono">{r.time_display}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{r.pace_display}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      ) : <Spinner />}
    </div>
  );
}
