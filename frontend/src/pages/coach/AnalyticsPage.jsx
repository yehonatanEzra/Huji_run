import { useState, useEffect, useCallback } from 'react';
import { parseISO, format } from 'date-fns';
import { getTeamVolume, getTeamCompletion, getTypeBreakdown } from '../../api/analytics';
import { listGroups } from '../../api/coach';
import Spinner from '../../components/ui/Spinner';

// Distinct line colors for the per-athlete view.
const SERIES_COLORS = ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6', '#22d3ee', '#fb923c'];

// Mirrors the workout-type palette used across the coach pages.
const TYPE_META = {
  simple:    { label: 'Other',     color: '#9ca3af' },
  easy:      { label: 'Easy',      color: '#34d399' },
  rest:      { label: 'Rest',      color: '#94a3b8' },
  tempo:     { label: 'Tempo',     color: '#fb923c' },
  long:      { label: 'Long',      color: '#a78bfa' },
  intervals: { label: 'Intervals', color: '#f87171' },
  fartlek:   { label: 'Fartlek',   color: '#f472b6' },
  race:      { label: 'Race',      color: '#818cf8' },
};
const typeMeta = (t) => TYPE_META[t] || { label: t, color: '#9ca3af' };

export default function AnalyticsPage() {
  const [groupId, setGroupId] = useState('');
  const [groups, setGroups] = useState([]);
  const [volume, setVolume] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [volumeMode, setVolumeMode] = useState('total'); // 'total' | 'avg'

  useEffect(() => {
    listGroups().then(({ data }) => setGroups(data)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = groupId ? { group_id: groupId } : {};
    Promise.all([
      getTeamVolume(params),
      getTeamCompletion(params),
      getTypeBreakdown(params),
    ])
      .then(([v, c, b]) => {
        setVolume(v.data);
        setCompletion(c.data);
        setBreakdown(b.data);
      })
      .catch((err) => setError(err.response?.data?.detail || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Team Analytics</h2>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-500 text-sm bg-red-50 rounded p-2">{error}</p>}
      {loading && <Spinner />}

      {!loading && volume && (
        <>
          {/* Volume */}
          <section className="bg-white border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Weekly volume</h3>
              <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
                {[['total', 'Total'], ['avg', 'Avg/athlete'], ['athletes', 'Per athlete']].map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => setVolumeMode(m)}
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      volumeMode === m ? 'bg-white shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {volumeMode === 'athletes' ? (
              <MultiLineChart buckets={volume.buckets} athletes={volume.athletes} />
            ) : (
              <>
                <BarChart
                  buckets={volume.buckets}
                  valueKey={volumeMode === 'total' ? 'total_km' : 'avg_km'}
                  unit="km"
                  color="#60a5fa"
                />
                <WoWChange buckets={volume.buckets} valueKey={volumeMode === 'total' ? 'total_km' : 'avg_km'} />
              </>
            )}
            <p className="text-xs text-gray-400 mt-2">{volume.athlete_count} athletes</p>
          </section>

          {/* Completion */}
          <section className="bg-white border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Logging completion rate</h3>
            <BarChart
              buckets={completion.buckets}
              valueKey="rate"
              unit="%"
              color="#34d399"
              asPercent
            />
          </section>

          {/* Type breakdown */}
          <section className="bg-white border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-1">Planned workout types</h3>
            <p className="text-xs text-gray-400 mb-3">
              Last {breakdown.days} days · {breakdown.total} workouts
            </p>
            {breakdown.total === 0 ? (
              <p className="text-sm text-gray-500">No workouts planned in this period.</p>
            ) : (
              <TypeBreakdownChart breakdown={breakdown} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function BarChart({ buckets, valueKey, unit, color, asPercent = false }) {
  const vals = buckets.map((b) => b[valueKey]);
  const max = Math.max(...vals, asPercent ? 1 : 0.0001);
  const fmt = (v) => (asPercent ? `${Math.round(v * 100)}%` : v);
  return (
    <div className="flex items-end gap-1 h-32">
      {buckets.map((b, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 group">
          <span className="text-[9px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            {fmt(b[valueKey])}{!asPercent && unit ? ` ${unit}` : ''}
          </span>
          <div
            className="w-full rounded-t transition-all"
            style={{
              height: `${(b[valueKey] / max) * 100}%`,
              minHeight: b[valueKey] > 0 ? '3px' : '0',
              backgroundColor: color,
            }}
            title={`${b.label}: ${fmt(b[valueKey])}${!asPercent && unit ? ' ' + unit : ''}`}
          />
          <span className="text-[8px] text-gray-400 rotate-0 whitespace-nowrap">{format(parseISO(b.start), 'd')}</span>
        </div>
      ))}
    </div>
  );
}

// FR-C↔FR-G: week-over-week % change for the latest bucket, shown inline.
function WoWChange({ buckets, valueKey }) {
  if (buckets.length < 2) return null;
  const cur = buckets[buckets.length - 1][valueKey];
  const prev = buckets[buckets.length - 2][valueKey];
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  return (
    <p className="text-xs mt-2">
      <span className="text-gray-400">This week vs last: </span>
      <span className={up ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium'}>
        {up ? '▲' : '▼'} {Math.abs(pct)}%
      </span>
    </p>
  );
}

// FR-G: per-athlete weekly volume as overlaid lines.
function MultiLineChart({ buckets, athletes }) {
  if (!athletes || athletes.length === 0) {
    return <p className="text-sm text-gray-500">No per-athlete volume yet.</p>;
  }
  const W = 100, H = 40;
  const n = buckets.length;
  const max = Math.max(1, ...athletes.flatMap((a) => a.weekly_km));
  const x = (i) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v) => H - (v / max) * H;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-32">
        {athletes.map((a, ai) => (
          <polyline
            key={a.user_id}
            fill="none"
            stroke={SERIES_COLORS[ai % SERIES_COLORS.length]}
            strokeWidth="0.7"
            points={a.weekly_km.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {athletes.map((a, ai) => (
          <span key={a.user_id} className="flex items-center gap-1 text-[10px] text-gray-600">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: SERIES_COLORS[ai % SERIES_COLORS.length] }} />
            {a.full_name}
          </span>
        ))}
      </div>
    </div>
  );
}

function TypeBreakdownChart({ breakdown }) {
  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-4 rounded-full overflow-hidden">
        {breakdown.slices.map((s) => (
          <div
            key={s.workout_type}
            style={{
              width: `${(s.count / breakdown.total) * 100}%`,
              backgroundColor: typeMeta(s.workout_type).color,
            }}
            title={`${typeMeta(s.workout_type).label}: ${s.count}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {breakdown.slices.map((s) => {
          const m = typeMeta(s.workout_type);
          const pct = Math.round((s.count / breakdown.total) * 100);
          return (
            <div key={s.workout_type} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: m.color }} />
              <span className="flex-1 truncate">{m.label}</span>
              <span className="text-gray-500">{s.count} ({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
