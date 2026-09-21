import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getWeeklyVolume, getMonthlyVolume } from '../../api/stats';
import Spinner from '../../components/ui/Spinner';

const GLASS = 'bg-[#201f20]/60 backdrop-blur-2xl border border-white/10';
const TAB = 'flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition';
const TAB_ACTIVE = 'bg-[#c0c1ff] text-[#1000a9]';
const TAB_INACTIVE = 'text-white/55 hover:text-white';

export default function VolumePage() {
  const { user } = useAuth();
  const params = useParams();
  const location = useLocation();
  const [tab, setTab] = useState('weeks');

  // A coach viewing one of their athletes passes the id in the route; otherwise
  // it's the logged-in athlete looking at their own volume.
  const coachView = !!params.athleteId;
  const targetId = coachView ? Number(params.athleteId) : user?.id;
  const athleteName = location.state?.athleteName;

  return (
    <div>
      {/* Coach view uses the black coach theme; athletes keep their photo background. */}
      {coachView ? (
        <div className="fixed inset-0 -z-10 bg-black" />
      ) : (
        <>
          <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
          <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.45) 20%, rgba(19,19,20,0.50) 80%)' }} />
        </>
      )}

      <h2 className="text-xl font-bold text-[#e5e2e3] mb-3">{coachView && athleteName ? `${athleteName} · Volume` : 'Volume'}</h2>

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

      {tab === 'weeks' && <WeeksView athleteId={targetId} />}
      {tab === 'months' && <MonthsView athleteId={targetId} />}
      {tab === 'diagram' && <DiagramView athleteId={targetId} />}
    </div>
  );
}

function SportBar({ label, km, max, color, textColor }) {
  const pct = max > 0 ? Math.max(km > 0 ? 2 : 0, (km / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-white/45 w-8 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold font-mono w-14 text-right ${km > 0 ? textColor : 'text-white/20'}`}>
        {km > 0 ? `${km.toFixed(1)} km` : '—'}
      </span>
    </div>
  );
}

function VolumeRow({ label, km, max, sub, cyclingKm = 0, swimKm = 0, maxCyc = 0, maxSwim = 0, strengthDays = 0, filter = 'all' }) {
  const showRun  = filter === 'all' || filter === 'running';
  const showCyc  = (filter === 'all' || filter === 'cycling')  && maxCyc > 0;
  const showSwim = (filter === 'all' || filter === 'swimming') && maxSwim > 0;
  const showStr  = (filter === 'all' || filter === 'strength') && strengthDays > 0;
  return (
    <div className={`${GLASS} rounded-xl px-4 py-3`}>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-semibold text-white truncate">{label}</p>
        {sub && <p className="text-[11px] text-white/45">{sub}</p>}
      </div>
      <div className="space-y-1.5">
        {showRun  && <SportBar label="Run"  km={km}        max={max}     color="bg-[#c0c1ff]/70"   textColor="text-[#c0c1ff]" />}
        {showCyc  && <SportBar label="Cyc"  km={cyclingKm} max={maxCyc}  color="bg-orange-400/70"  textColor="text-orange-300" />}
        {showSwim && <SportBar label="Swim" km={swimKm}    max={maxSwim} color="bg-blue-400/70"    textColor="text-blue-300" />}
        {showStr && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/45 w-8 shrink-0">💪</span>
            <div className="flex-1" />
            <span className="text-xs font-bold text-amber-200 w-14 text-right">{strengthDays} {strengthDays === 1 ? 'day' : 'days'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Segmented filter for choosing which sports to show. Options only appear when
// the athlete has actually logged that sport.
function SportFilter({ value, onChange, hasCyc, hasSwim, hasStr }) {
  const opts = [['all', 'All'], ['running', 'Run']];
  if (hasCyc)  opts.push(['cycling', 'Cyc']);
  if (hasSwim) opts.push(['swimming', 'Swim']);
  if (hasStr)  opts.push(['strength', '💪']);
  if (opts.length <= 2) return null;   // nothing to filter — pure runner
  return (
    <div className={`flex gap-1 p-1 rounded-full mb-3 ${GLASS}`}>
      {opts.map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)}
          className={`${TAB} ${value === key ? TAB_ACTIVE : TAB_INACTIVE}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function WeeksView({ athleteId }) {
  const [buckets, setBuckets] = useState(null);
  const [filter, setFilter] = useState('all');

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

  const max     = Math.max(...buckets.map((b) => b.km), 0);
  const maxCyc  = Math.max(...buckets.map((b) => b.cycling_km || 0), 0);
  const maxSwim = Math.max(...buckets.map((b) => b.swim_km    || 0), 0);
  const hasStr  = buckets.some((b) => (b.strength_days || 0) > 0);
  return (
    <div>
      <SportFilter value={filter} onChange={setFilter} hasCyc={maxCyc > 0} hasSwim={maxSwim > 0} hasStr={hasStr} />
      <div className="space-y-2">
        {buckets.map((b) => {
          const s = new Date(b.start + 'T00:00');
          const e = new Date(s); e.setDate(e.getDate() + 6);
          const fmt = (d) => d.toLocaleString('en', { month: 'short', day: 'numeric' });
          const label = s.getMonth() === e.getMonth()
            ? `${fmt(s)} – ${e.getDate()}`
            : `${fmt(s)} – ${fmt(e)}`;
          return (
            <VolumeRow key={b.start} label={label} km={b.km} max={max}
              cyclingKm={b.cycling_km || 0} swimKm={b.swim_km || 0} maxCyc={maxCyc} maxSwim={maxSwim}
              strengthDays={b.strength_days || 0} filter={filter} />
          );
        })}
      </div>
    </div>
  );
}

function MonthsView({ athleteId }) {
  const [data, setData] = useState(null);
  const [year, setYear] = useState(null);
  const [filter, setFilter] = useState('all');

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

  const max     = Math.max(...(data.buckets || []).map((b) => b.km), 0);
  const maxCyc  = Math.max(...(data.buckets || []).map((b) => b.cycling_km || 0), 0);
  const maxSwim = Math.max(...(data.buckets || []).map((b) => b.swim_km    || 0), 0);
  const hasStr  = (data.buckets || []).some((b) => (b.strength_days || 0) > 0);
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

      <SportFilter value={filter} onChange={setFilter} hasCyc={maxCyc > 0} hasSwim={maxSwim > 0} hasStr={hasStr} />

      <div className="space-y-2">
        {data.buckets.map((b) => (
          <VolumeRow key={b.start} label={b.label} km={b.km} max={max}
            cyclingKm={b.cycling_km || 0} swimKm={b.swim_km || 0} maxCyc={maxCyc} maxSwim={maxSwim}
            strengthDays={b.strength_days || 0} filter={filter} />
        ))}
      </div>
    </div>
  );
}

function DiagramView({ athleteId }) {
  const [sport, setSport] = useState('running');
  const [weekBuckets, setWeekBuckets] = useState(null);
  const [monthBuckets, setMonthBuckets] = useState(null);

  useEffect(() => {
    if (!athleteId) return;
    let alive = true;
    setWeekBuckets(null); setMonthBuckets(null);
    getWeeklyVolume(athleteId)
      .then(({ data }) => alive && setWeekBuckets(data.buckets.slice(0, 12).reverse()))
      .catch(() => alive && setWeekBuckets([]));
    getMonthlyVolume(athleteId)
      .then(({ data }) => alive && setMonthBuckets(data.buckets))
      .catch(() => alive && setMonthBuckets([]));
    return () => { alive = false; };
  }, [athleteId]);

  const weekLabel  = (b) => { const d = new Date(b.start + 'T00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const monthLabel = (b) => new Date(b.start + 'T00:00').toLocaleString('en', { month: 'short' });

  const kmFn    = sport === 'running' ? (b) => b.km :
                  sport === 'cycling' ? (b) => b.cycling_km || 0 :
                                        (b) => b.swim_km    || 0;
  const barColor = sport === 'running' ? 'bg-gradient-to-t from-[#c0c1ff]/40 to-[#c0c1ff]' :
                   sport === 'cycling' ? 'bg-gradient-to-t from-orange-400/40 to-orange-400' :
                                         'bg-gradient-to-t from-blue-400/40 to-blue-400';
  const titleColor = sport === 'running' ? 'text-[#c0c1ff]' :
                     sport === 'cycling' ? 'text-orange-300' : 'text-blue-300';

  return (
    <div className="space-y-4">
      <div className={`flex gap-1 p-1 rounded-full ${GLASS}`}>
        {[['running', 'Running'], ['cycling', 'Cycling'], ['swimming', 'Swimming']].map(([key, label]) => (
          <button key={key} onClick={() => setSport(key)}
            className={`${TAB} ${sport === key ? TAB_ACTIVE : TAB_INACTIVE}`}>
            {label}
          </button>
        ))}
      </div>
      <BarChart title="Weekly" buckets={weekBuckets} labelFn={weekLabel} kmFn={kmFn} barColor={barColor} titleColor={titleColor} />
      <BarChart title="Monthly" buckets={monthBuckets} labelFn={monthLabel} kmFn={kmFn} barColor={barColor} titleColor={titleColor} />
    </div>
  );
}

function BarChart({ title, buckets, labelFn, kmFn = (b) => b.km, barColor = 'bg-gradient-to-t from-[#c0c1ff]/40 to-[#c0c1ff]', titleColor = 'text-[#c0c1ff]' }) {
  if (!buckets) return <div className={`${GLASS} rounded-2xl p-4`}><Spinner /></div>;
  const max = Math.max(...buckets.map((b) => kmFn(b)), 0);
  return (
    <div className={`${GLASS} rounded-2xl p-3`}>
      <p className={`text-[11px] font-bold uppercase tracking-widest mb-3 ${titleColor}`}>{title}</p>
      <div className="flex items-end justify-between gap-0.5 h-40">
        {buckets.map((b) => {
          const v = kmFn(b);
          const h = max > 0 ? Math.max(v > 0 ? 3 : 0, (v / max) * 100) : 0;
          return (
            <div key={b.start} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1">
              <span className="text-[7px] text-white/50 font-mono leading-none">{v > 0 ? v.toFixed(0) : ''}</span>
              <div className={`w-full rounded-t ${barColor}`} style={{ height: `${h}%` }} />
              <span className="text-[7px] text-white/45 truncate w-full text-center leading-none">{labelFn(b)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
