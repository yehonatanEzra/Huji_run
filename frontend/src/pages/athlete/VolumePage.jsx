import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getWeeklyVolume, getMonthlyVolume, getKmSeries } from '../../api/stats';
import Spinner from '../../components/ui/Spinner';

const GLASS = 'bg-[#201f20]/60 backdrop-blur-2xl border border-white/10';
const TAB = 'flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition';
const TAB_ACTIVE = 'bg-[#c0c1ff] text-[#1000a9]';
const TAB_INACTIVE = 'text-white/55 hover:text-white';

export default function VolumePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('weeks');

  return (
    <div>
      {/* Same background as the training log */}
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.45) 20%, rgba(19,19,20,0.50) 80%)' }} />

      <h2 className="text-xl font-bold text-[#e5e2e3] mb-3">Volume</h2>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-full mb-4 ${GLASS}`}>
        {[['weeks', 'Weeks'], ['months', 'Months'], ['diagram', 'Diagram']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`${TAB} ${tab === key ? TAB_ACTIVE : TAB_INACTIVE}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'weeks' && <WeeksView athleteId={user?.id} />}
      {tab === 'months' && <MonthsView athleteId={user?.id} />}
      {tab === 'diagram' && <DiagramView athleteId={user?.id} />}
    </div>
  );
}

// Coloured volume bar relative to the largest value in the list.
function VolumeRow({ label, km, max, sub }) {
  const pct = max > 0 ? Math.max(2, (km / max) * 100) : 0;
  return (
    <div className={`${GLASS} rounded-xl px-4 py-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{label}</p>
          {sub && <p className="text-[11px] text-white/45">{sub}</p>}
        </div>
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-lg font-bold text-[#c0c1ff] font-mono">{km.toFixed(1)}</span>
          <span className="text-xs text-white/40">km</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full bg-[#c0c1ff]/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function WeeksView({ athleteId }) {
  const [buckets, setBuckets] = useState(null);

  useEffect(() => {
    if (!athleteId) return;
    let alive = true;
    getWeeklyVolume(athleteId)
      .then(({ data }) => alive && setBuckets(data.buckets))
      .catch(() => alive && setBuckets([]));
    return () => { alive = false; };
  }, [athleteId]);

  if (!buckets) return <Spinner />;
  if (buckets.length === 0) return <p className="text-center text-white/50 py-10">No runs logged yet.</p>;

  const max = Math.max(...buckets.map((b) => b.km), 0);
  return (
    <div className="space-y-2">
      {buckets.map((b) => (
        <VolumeRow key={b.start} label={`Week of ${b.label}`} km={b.km} max={max} />
      ))}
    </div>
  );
}

function MonthsView({ athleteId }) {
  const [data, setData] = useState(null);
  const [year, setYear] = useState(null);

  useEffect(() => {
    if (!athleteId) return;
    let alive = true;
    setData(null);
    getMonthlyVolume(athleteId, year)
      .then(({ data }) => {
        if (!alive) return;
        setData(data);
        if (year == null) setYear(data.year);
      })
      .catch(() => alive && setData({ buckets: [] }));
    return () => { alive = false; };
  }, [athleteId, year]);

  if (!data) return <Spinner />;

  const max = Math.max(...(data.buckets || []).map((b) => b.km), 0);
  const canPrev = true;                       // earlier (empty) years are browsable
  const canNext = data.year < data.latest_year;  // never into the future

  return (
    <div>
      {/* Year switcher */}
      <div className={`flex items-center justify-between ${GLASS} rounded-full px-2 py-1.5 mb-3`}>
        <button
          onClick={() => canPrev && setYear(data.year - 1)}
          disabled={!canPrev}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 disabled:opacity-25 hover:bg-white/10 transition"
        >‹</button>
        <span className="text-sm font-bold text-white tracking-wider">{data.year}</span>
        <button
          onClick={() => canNext && setYear(data.year + 1)}
          disabled={!canNext}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 disabled:opacity-25 hover:bg-white/10 transition"
        >›</button>
      </div>

      <div className="space-y-2">
        {data.buckets.map((b) => (
          <VolumeRow key={b.start} label={b.label} km={b.km} max={max} />
        ))}
      </div>
    </div>
  );
}

function DiagramView({ athleteId }) {
  const [week, setWeek] = useState(null);
  const [month, setMonth] = useState(null);

  useEffect(() => {
    if (!athleteId) return;
    let alive = true;
    setWeek(null); setMonth(null);
    getKmSeries(athleteId, 'week').then(({ data }) => alive && setWeek(data.buckets)).catch(() => alive && setWeek([]));
    getKmSeries(athleteId, 'month').then(({ data }) => alive && setMonth(data.buckets)).catch(() => alive && setMonth([]));
    return () => { alive = false; };
  }, [athleteId]);

  // Compact axis labels keep the 12 monthly bars inside the page width.
  const weekLabel = (b) => { const d = new Date(b.start + 'T00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const monthLabel = (b) => new Date(b.start + 'T00:00').toLocaleString('en', { month: 'short' });

  return (
    <div className="space-y-4">
      <BarChart title="Weekly volume" buckets={week} labelFn={weekLabel} />
      <BarChart title="Monthly volume" buckets={month} labelFn={monthLabel} />
    </div>
  );
}

function BarChart({ title, buckets, labelFn }) {
  if (!buckets) return <div className={`${GLASS} rounded-2xl p-4`}><Spinner /></div>;
  const max = Math.max(...buckets.map((b) => b.km), 0);
  return (
    <div className={`${GLASS} rounded-2xl p-3`}>
      <p className="text-[11px] font-bold uppercase tracking-widest text-[#c0c1ff] mb-3">{title}</p>
      <div className="flex items-end justify-between gap-0.5 h-40">
        {buckets.map((b) => {
          const h = max > 0 ? Math.max(3, (b.km / max) * 100) : 0;
          return (
            <div key={b.start} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1">
              <span className="text-[7px] text-white/50 font-mono leading-none">{b.km > 0 ? b.km.toFixed(0) : ''}</span>
              <div className="w-full rounded-t bg-gradient-to-t from-[#c0c1ff]/40 to-[#c0c1ff]" style={{ height: `${h}%` }} />
              <span className="text-[7px] text-white/45 truncate w-full text-center leading-none">{labelFn(b)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
