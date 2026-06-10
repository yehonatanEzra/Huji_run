import { useEffect, useState } from 'react';
import { getKmSeries, getPaceTrends, getActivity } from '../api/stats';
import Spinner from './ui/Spinner';

const CARD = 'bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-3xl p-6';
const SECTION_TITLE = 'text-sm font-bold uppercase tracking-widest text-white/80';

function fmtPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtTime(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PerformanceGraphs({ athleteId }) {
  return (
    <div className="space-y-4">
      <VolumeCard athleteId={athleteId} />
      <ConsistencyCard athleteId={athleteId} />
      <RaceHistoryCard athleteId={athleteId} />
    </div>
  );
}

function ConsistencyCard({ athleteId }) {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getActivity(athleteId, period)
      .then(({ data }) => { if (alive) setData(data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [athleteId, period]);

  const buckets = data?.buckets ?? [];
  const totals = buckets.reduce((acc, b) => ({
    running_days: acc.running_days + b.running_days,
    completed:    acc.completed    + b.completed,
    partial:      acc.partial      + b.partial,
    missed:       acc.missed       + b.missed,
    prescribed:   acc.prescribed   + b.prescribed_days,
  }), { running_days: 0, completed: 0, partial: 0, missed: 0, prescribed: 0 });
  const n = buckets.length || 1;
  const avg = (v) => (v / n).toFixed(1);
  const hasAnyData = buckets.some((b) =>
    b.running_days || b.completed || b.partial || b.missed || b.prescribed_days,
  );
  const unitNoun = period === 'week' ? 'week' : 'month';
  const unitShort = period === 'week' ? 'wk' : 'mo';

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className={SECTION_TITLE}>Consistency</h3>
        <div className="flex p-1 gap-1 rounded-lg border border-white/10 bg-white/5 text-[11px] font-bold">
          {['week', 'month'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md transition ${
                period === p ? 'bg-white text-black' : 'text-white/50 hover:text-white'
              }`}
            >
              {p === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="py-6 flex justify-center"><Spinner /></div>
      ) : !hasAnyData ? (
        <p className="text-sm text-white/50 italic py-4 text-center">No activity yet</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] text-white/55 mb-1">Days running per {unitNoun}</p>
            <RunningDaysBars buckets={buckets} period={period} />
          </div>
          <div>
            <p className="text-[11px] text-white/55 mb-1">Completed vs missed (vs what the coach planned)</p>
            <CompletionBars buckets={buckets} period={period} />
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-white/70">
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400/85" /> Done</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400/85" /> Half</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400/85" /> Missed</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-sky-300" /> Coach planned</span>
            </div>
          </div>
          {/* Period totals + averages — answers "how am I doing overall, and on a typical week/month?" */}
          <div className="border-t border-white/10 pt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div className="col-span-2 text-white/45 uppercase tracking-wider text-[9px] font-semibold">
              Last {n} {unitNoun}{n === 1 ? '' : 's'}
            </div>
            <Stat label="Running days" total={totals.running_days} avg={avg(totals.running_days)} unit={unitShort} color="text-emerald-200" />
            <Stat label="Completed"   total={totals.completed}    avg={avg(totals.completed)}    unit={unitShort} color="text-emerald-200" />
            <Stat label="Half"        total={totals.partial}      avg={avg(totals.partial)}      unit={unitShort} color="text-amber-200" />
            <Stat label="Missed"      total={totals.missed}       avg={avg(totals.missed)}       unit={unitShort} color="text-rose-200" />
            <Stat label="Coach planned" total={totals.prescribed} avg={avg(totals.prescribed)}   unit={unitShort} color="text-sky-200" />
            <Stat
              label="Adherence"
              total={totals.prescribed > 0 ? `${Math.round((totals.completed / totals.prescribed) * 100)}%` : '—'}
              avg={null}
              unit=""
              color="text-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, total, avg, unit, color }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5">
      <span className="text-white/60 text-xs truncate">{label}</span>
      <span className="whitespace-nowrap flex items-center gap-1.5">
        <span className={`font-bold text-sm ${color}`}>{total}</span>
        {avg != null && (
          <span className="text-white/40 text-[10px]">{avg}/{unit}</span>
        )}
      </span>
    </div>
  );
}

function RunningDaysBars({ buckets, period }) {
  const w = 320, h = 90, baseline = 78, padX = 10;
  const innerW = w - padX * 2;
  const barW = innerW / buckets.length;
  const usableH = baseline - 6;
  // Fixed-scale per period so weeks are comparable to each other (max 7
  // days) and months to each other (~31). Avoids the bars dancing as data
  // changes.
  const scaleMax = period === 'month' ? 31 : 7;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24 block">
        <line x1={padX} y1={baseline} x2={w - padX} y2={baseline} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        {buckets.map((b, i) => {
          const bh = (b.running_days / scaleMax) * usableH;
          const x = padX + i * barW + barW * 0.18;
          const bw = barW * 0.64;
          const y = baseline - bh;
          return (
            <g key={b.start}>
              <rect x={x} y={y} width={bw} height={bh} rx="2" fill={b.running_days > 0 ? 'rgba(167,243,208,0.85)' : 'rgba(255,255,255,0.08)'}>
                <title>{b.label}: {b.running_days} running day{b.running_days === 1 ? '' : 's'}</title>
              </rect>
              {b.running_days > 0 && (
                <text x={x + bw / 2} y={y - 2} fontSize="8" fill="rgba(255,255,255,0.85)" textAnchor="middle">{b.running_days}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between px-2 mt-0.5 text-[9px] text-white/45">
        {buckets.map((b, i) => (
          <span key={b.start} className={i % 2 === 0 ? '' : 'opacity-0'}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}

function CompletionBars({ buckets, period }) {
  // Stacked bars: completed (bottom), partial (middle), missed (top). A
  // dashed sky line marks the coach-planned count per bucket, so an athlete
  // can see at a glance how their reports stack up against what was set.
  const w = 320, h = 100, baseline = 88, padX = 10;
  const innerW = w - padX * 2;
  const barW = innerW / buckets.length;
  const usableH = baseline - 6;
  const floor = period === 'month' ? 20 : 7;
  const planMax = Math.max(floor, ...buckets.map((b) => Math.max(b.completed + b.partial + b.missed, b.prescribed_days)));
  const yFor = (count) => baseline - (count / planMax) * usableH;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24 block">
      <line x1={padX} y1={baseline} x2={w - padX} y2={baseline} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      {buckets.map((b, i) => {
        const x = padX + i * barW + barW * 0.18;
        const bw = barW * 0.64;
        const yC = yFor(b.completed);
        const yP = yFor(b.completed + b.partial);
        const yM = yFor(b.completed + b.partial + b.missed);
        const hC = baseline - yC;
        const hP = yC - yP;
        const hM = yP - yM;
        const planY = yFor(b.prescribed_days);
        return (
          <g key={b.start}>
            {hC > 0 && (
              <rect x={x} y={yC} width={bw} height={hC} fill="rgba(52,211,153,0.85)">
                <title>{b.label}: {b.completed} completed</title>
              </rect>
            )}
            {hP > 0 && (
              <rect x={x} y={yP} width={bw} height={hP} fill="rgba(251,191,36,0.85)">
                <title>{b.label}: {b.partial} partial</title>
              </rect>
            )}
            {hM > 0 && (
              <rect x={x} y={yM} width={bw} height={hM} fill="rgba(244,114,182,0.85)">
                <title>{b.label}: {b.missed} missed</title>
              </rect>
            )}
            {b.prescribed_days > 0 && (
              <line
                x1={x - 1}
                x2={x + bw + 1}
                y1={planY}
                y2={planY}
                stroke="rgba(125,211,252,0.95)"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              >
                <title>{b.label}: coach planned {b.prescribed_days} day{b.prescribed_days === 1 ? '' : 's'}</title>
              </line>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function VolumeCard({ athleteId }) {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getKmSeries(athleteId, period)
      .then(({ data }) => { if (alive) setData(data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [athleteId, period]);

  const total = data?.buckets?.reduce((s, b) => s + b.km, 0) ?? 0;
  const max = data?.buckets?.reduce((m, b) => Math.max(m, b.km), 0) ?? 0;
  const hasData = total > 0;

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className={SECTION_TITLE}>Volume</h3>
        <div className="flex p-1 gap-1 rounded-lg border border-white/10 bg-white/5 text-[11px] font-bold">
          {['week', 'month'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md transition ${
                period === p ? 'bg-white text-black' : 'text-white/50 hover:text-white'
              }`}
            >
              {p === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center"><Spinner /></div>
      ) : !hasData ? (
        <p className="text-sm text-white/50 italic py-4 text-center">No volume yet</p>
      ) : (
        <>
          <VolumeBars buckets={data.buckets} max={max} />
          <p className="text-[11px] text-white/55 mt-2 text-right">
            Total over {data.buckets.length} {period === 'week' ? 'weeks' : 'months'}:{' '}
            <span className="text-white/85 font-semibold">{total.toFixed(1)} km</span>
          </p>
        </>
      )}
    </div>
  );
}

function VolumeBars({ buckets, max }) {
  // viewBox: 320 wide, 100 tall. Bars sit on the baseline at y=85.
  const w = 320, h = 100, baseline = 85, padX = 10;
  const innerW = w - padX * 2;
  const barW = innerW / buckets.length;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32 block">
        {/* baseline */}
        <line x1={padX} y1={baseline} x2={w - padX} y2={baseline} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        {buckets.map((b, i) => {
          const bh = max > 0 ? (b.km / max) * (baseline - 10) : 0;
          const x = padX + i * barW + barW * 0.15;
          const bw = barW * 0.7;
          const y = baseline - bh;
          return (
            <g key={b.start}>
              <rect
                x={x}
                y={y}
                width={bw}
                height={bh}
                rx="2"
                fill={b.km > 0 ? 'rgba(96,165,250,0.85)' : 'rgba(255,255,255,0.1)'}
              >
                <title>{b.label}: {b.km.toFixed(1)} km</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between mt-1 px-2 text-[9px] text-white/45">
        {buckets.map((b, i) => (
          // Show every other label to avoid crowding on mobile
          <span key={b.start} className={i % 2 === 0 ? '' : 'opacity-0'}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}

function RaceHistoryCard({ athleteId }) {
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getPaceTrends(athleteId)
      .then(({ data }) => { if (alive) setSeries(data.distances); })
      .catch(() => { if (alive) setSeries(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [athleteId]);

  // Flatten all distances into one chronological list (newest first), since
  // pace-trends already returns approved results per distance with PB flags.
  const races = (series ?? [])
    .flatMap((s) => s.points.map((p) => ({
      ...p,
      distance_label: s.label,
      distance_m: s.distance_m,
    })))
    .sort((a, b) => (a.race_date < b.race_date ? 1 : -1));

  return (
    <div className={CARD}>
      <h3 className={`${SECTION_TITLE} mb-3`}>Race history</h3>
      {loading ? (
        <div className="py-6 flex justify-center"><Spinner /></div>
      ) : races.length === 0 ? (
        <p className="text-sm text-white/50 italic py-4 text-center">No races yet</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {races.map((r, i) => (
            <div
              key={`${r.race_date}-${r.distance_m}-${i}`}
              className={`flex items-center justify-between gap-2 bg-white/[0.04] border border-white/[0.08] border-l-4 ${
                r.is_pb ? 'border-l-amber-400' : 'border-l-[#8083ff]'
              } rounded-xl px-4 py-3 text-sm transition active:scale-[0.98] hover:brightness-125`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-base truncate flex items-center gap-1.5">
                  {r.is_pb && <span>🥇</span>}
                  {r.race_name || r.distance_label}
                </p>
                <p className="text-xs text-white/40 mt-0.5">
                  {r.race_date} · {r.distance_label}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-white font-mono font-bold text-base">{fmtTime(r.time_seconds)}</p>
                <p className="text-[10px] text-white/40 uppercase">{fmtPace(r.pace_seconds_per_km)} /km</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
