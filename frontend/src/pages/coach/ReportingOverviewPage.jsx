import { useState, useEffect, useCallback } from 'react';
import { getISOWeek, getISOWeekYear, startOfISOWeek, addWeeks, subWeeks } from 'date-fns';
import { getReportingOverview, alertNonLoggers, getLoadOverview } from '../../api/reporting';
import { listGroups } from '../../api/coach';
import Spinner from '../../components/ui/Spinner';

function toIsoWeekStr(d) {
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
}

function prevWeek(w) {
  const [y, n] = w.split('-W').map(Number);
  return toIsoWeekStr(subWeeks(startOfISOWeek(new Date(y, 0, 4 + (n - 1) * 7)), 1));
}

function nextWeek(w) {
  const [y, n] = w.split('-W').map(Number);
  return toIsoWeekStr(addWeeks(startOfISOWeek(new Date(y, 0, 4 + (n - 1) * 7)), 1));
}

const RATE_COLORS = [
  [1.0, 'bg-emerald-500'],
  [0.7, 'bg-green-400'],
  [0.4, 'bg-amber-400'],
  [0.0, 'bg-red-400'],
];

function rateColor(rate) {
  for (const [threshold, cls] of RATE_COLORS) {
    if (rate >= threshold) return cls;
  }
  return 'bg-red-400';
}

export default function ReportingOverviewPage() {
  const [view, setView] = useState('reporting'); // 'reporting' | 'load'
  const [week, setWeek] = useState(() => toIsoWeekStr(new Date()));
  const [groupId, setGroupId] = useState('');
  const [groups, setGroups] = useState([]);
  const [data, setData] = useState(null);
  const [loadData, setLoadData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [alertDays, setAlertDays] = useState(3);
  const [alerting, setAlerting] = useState(false);
  const [alertResult, setAlertResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listGroups().then(({ data }) => setGroups(data)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = { week };
    if (groupId) params.group_id = groupId;
    const req = view === 'load' ? getLoadOverview(params) : getReportingOverview(params);
    req
      .then(({ data: res }) => (view === 'load' ? setLoadData(res) : setData(res)))
      .catch((err) => setError(err.response?.data?.detail || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [week, groupId, view]);

  useEffect(() => { load(); }, [load]);

  const handleAlert = async () => {
    setAlerting(true);
    setAlertResult(null);
    try {
      const { data: res } = await alertNonLoggers(alertDays);
      setAlertResult(`Sent reminders to ${res.alerted} athlete${res.alerted !== 1 ? 's' : ''}.`);
    } catch (err) {
      setAlertResult(err.response?.data?.detail || 'Failed to send alerts');
    } finally {
      setAlerting(false);
    }
  };

  const currentWeek = toIsoWeekStr(new Date());
  const isCurrentWeek = week === currentWeek;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold">Reporting</h2>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { value: 'reporting', label: 'Logging' },
          { value: 'load', label: 'Load' },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setView(value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1 bg-white border rounded-lg px-1">
          <button
            onClick={() => setWeek(prevWeek(week))}
            className="px-2 py-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            ‹
          </button>
          <span className="text-sm font-medium px-1 min-w-[90px] text-center">{week}</span>
          <button
            onClick={() => setWeek(nextWeek(week))}
            disabled={isCurrentWeek}
            className="px-2 py-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30"
          >
            ›
          </button>
        </div>

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

      {error && (
        <p className="text-red-500 text-sm bg-red-50 rounded p-2">{error}</p>
      )}

      {loading && <Spinner />}

      {/* ── Logging view ─────────────────────────────────────────────── */}
      {view === 'reporting' && data && !loading && (
        <>
          <p className="text-xs text-gray-500">
            {data.week_start} – {data.week_end} · {data.athletes.length} athlete{data.athletes.length !== 1 ? 's' : ''}
          </p>

          {data.athletes.length === 0 ? (
            <p className="text-gray-500 text-sm">No athletes in selected group.</p>
          ) : (
            <div className="space-y-2">
              {data.athletes.map((a) => (
                <div key={a.user_id} className="bg-white border rounded-lg px-3 py-2 flex items-center gap-3">
                  <div className="w-1.5 self-stretch rounded-full overflow-hidden bg-gray-100 shrink-0">
                    <div
                      className={`${rateColor(a.response_rate)} rounded-full transition-all`}
                      style={{ height: `${Math.round(a.response_rate * 100)}%` }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.full_name}</p>
                    {a.group_name && <p className="text-xs text-gray-400 truncate">{a.group_name}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{a.days_logged}/{a.total_days}</p>
                    <p className="text-xs text-gray-400">{Math.round(a.response_rate * 100)}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Alert panel */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-900">Send reminders to silent athletes</p>
            <div className="flex items-center gap-2">
              <label className="text-xs text-amber-800">Silent for</label>
              <select
                value={alertDays}
                onChange={(e) => setAlertDays(Number(e.target.value))}
                className="border border-amber-300 rounded px-2 py-1 text-xs bg-white"
              >
                {[1, 2, 3, 5, 7, 10, 14].map((d) => (
                  <option key={d} value={d}>{d} day{d !== 1 ? 's' : ''}</option>
                ))}
              </select>
              <button
                onClick={handleAlert}
                disabled={alerting}
                className="text-xs bg-amber-600 text-white rounded px-3 py-1 hover:bg-amber-700 disabled:opacity-50"
              >
                {alerting ? 'Sending…' : 'Send reminders'}
              </button>
            </div>
            {alertResult && <p className="text-xs text-amber-900">{alertResult}</p>}
          </div>
        </>
      )}

      {/* ── Load view ────────────────────────────────────────────────── */}
      {view === 'load' && loadData && !loading && (
        <>
          <p className="text-xs text-gray-500">
            Weekly km · spike = current week &gt;{loadData.threshold_pct}% over baseline ·{' '}
            {loadData.athletes.filter((a) => a.is_spike).length} flagged
          </p>

          {loadData.athletes.length === 0 ? (
            <p className="text-gray-500 text-sm">No athletes in selected group.</p>
          ) : (
            <div className="space-y-2">
              {loadData.athletes.map((a) => (
                <LoadCard key={a.user_id} a={a} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LoadCard({ a }) {
  const max = Math.max(...a.weekly_km, 1);
  return (
    <div className={`border rounded-lg px-3 py-2 ${a.is_spike ? 'bg-red-50 border-red-300' : 'bg-white'}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {a.is_spike && <span title="Load spike">⚠️ </span>}
            {a.full_name}
          </p>
          {a.group_name && <p className="text-xs text-gray-400 truncate">{a.group_name}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{a.current_week_km} km</p>
          {a.spike_pct !== null ? (
            <p className={`text-xs ${a.is_spike ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
              {a.spike_pct > 0 ? '+' : ''}{a.spike_pct}% vs {a.avg_prev_km}
            </p>
          ) : (
            <p className="text-xs text-gray-400">no baseline</p>
          )}
        </div>
      </div>
      {/* Sparkline: weekly km, current week last */}
      <div className="flex items-end gap-0.5 h-8 mt-2">
        {a.weekly_km.map((km, i) => {
          const isCurrent = i === a.weekly_km.length - 1;
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm ${
                isCurrent
                  ? a.is_spike ? 'bg-red-400' : 'bg-blue-400'
                  : 'bg-gray-200'
              }`}
              style={{ height: `${Math.max((km / max) * 100, 4)}%` }}
              title={`${km} km`}
            />
          );
        })}
      </div>
    </div>
  );
}
