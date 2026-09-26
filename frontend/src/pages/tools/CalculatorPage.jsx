import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getMyProfile } from '../../api/profile';
import Tabs from '../../components/ui/Tabs';
import { formatClock, formatPacePerKm, parseHMS } from '../../utils/time';
import { computeZones } from '../../lib/vdot';
import { eventsByCategory, pointsFor, EVENT_BY_ID } from '../../lib/waPoints';

const GLASS = 'bg-[#161616]/85 backdrop-blur-2xl border border-white/10';
const INPUT = 'w-full bg-[#1c1b1c]/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20';
const NUM = 'w-16 bg-[#1c1b1c]/60 border border-white/10 rounded-xl px-2 py-2 text-sm text-white text-center focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20';

// Mirrors backend CANONICAL_DISTANCES (models/race.py). Zones/VDOT is a
// distance-running model, so only running distances appear here.
const RUN_DISTANCES = [
  { value: 1500, label: '1,500m' },
  { value: 3000, label: '3,000m' },
  { value: 5000, label: '5,000m' },
  { value: 10000, label: '10,000m' },
  { value: 21100, label: 'Half Marathon' },
  { value: 42200, label: 'Marathon' },
];

const pace = (sec) => formatPacePerKm(sec);

// ── H / M / S input group ────────────────────────────────────────────────────
function TimeFields({ value, onChange, showHours = true }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value.replace(/[^0-9]/g, '') });
  return (
    <div className="flex items-center gap-1.5">
      {showHours && (
        <>
          <input className={NUM} inputMode="numeric" placeholder="h" value={value.h} onChange={set('h')} aria-label="hours" />
          <span className="text-white/40">:</span>
        </>
      )}
      <input className={NUM} inputMode="numeric" placeholder="min" value={value.m} onChange={set('m')} aria-label="minutes" />
      <span className="text-white/40">:</span>
      <input className={NUM} inputMode="numeric" placeholder="sec" value={value.s} onChange={set('s')} aria-label="seconds" />
    </div>
  );
}

// ── Zones (VDOT) tab ─────────────────────────────────────────────────────────
function ZonesTab({ initialDistance }) {
  const presetValues = RUN_DISTANCES.map((d) => d.value);
  const initIsPreset = initialDistance != null && presetValues.includes(initialDistance);
  const [pbByDistance, setPbByDistance] = useState({});
  const [distance, setDistance] = useState(initIsPreset ? initialDistance : (initialDistance != null ? 'custom' : 5000));
  const [custom, setCustom] = useState(initialDistance != null && !initIsPreset ? String(initialDistance) : '');
  const [time, setTime] = useState({ h: '', m: '', s: '' });
  const [touchedTime, setTouchedTime] = useState(false);

  const secToFields = (sec) => ({ h: sec >= 3600 ? String(Math.floor(sec / 3600)) : '', m: String(Math.floor((sec % 3600) / 60)), s: String(sec % 60).padStart(2, '0') });

  // Load the athlete's PBs, then prefill the initially-selected distance's time
  // (setState here is inside the async callback, not synchronously in the effect).
  useEffect(() => {
    getMyProfile()
      .then(({ data }) => {
        const map = {};
        (data.personal_bests || []).forEach((pb) => { map[pb.distance_m] = pb; });
        setPbByDistance(map);
        const pb = map[distance];
        if (pb && !touchedTime) setTime(secToFields(pb.time_seconds));
      })
      .catch(() => setPbByDistance({}));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const distanceM = distance === 'custom' ? parseInt(custom, 10) || 0 : distance;
  const timeSec = parseHMS(time);
  const result = useMemo(() => computeZones(distanceM, timeSec), [distanceM, timeSec]);
  const valid = Number.isFinite(result.vdot) && result.vdot > 0;

  const onPickDistance = (v) => {
    const next = v === 'custom' ? 'custom' : parseInt(v, 10);
    setDistance(next);
    setTouchedTime(false); // a fresh distance choice re-enables PB auto-fill
    const pb = next === 'custom' ? null : pbByDistance[next];
    setTime(pb ? secToFields(pb.time_seconds) : { h: '', m: '', s: '' });
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-4 space-y-3 ${GLASS}`}>
        <div>
          <label className="block text-xs text-white/50 mb-1">Distance</label>
          <select
            className={INPUT}
            value={distance}
            onChange={(e) => onPickDistance(e.target.value)}
          >
            {RUN_DISTANCES.map((d) => {
              const pb = pbByDistance[d.value];
              return (
                <option key={d.value} value={d.value} className="bg-blue-950 text-white">
                  {d.label}{pb ? ` · ${pb.time_display} PB` : ''}
                </option>
              );
            })}
            <option value="custom" className="bg-blue-950 text-white">Custom…</option>
          </select>
        </div>

        {distance === 'custom' && (
          <div>
            <label className="block text-xs text-white/50 mb-1">Distance in metres</label>
            <input className={INPUT} inputMode="numeric" placeholder="e.g. 8000" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
        )}

        <div>
          <label className="block text-xs text-white/50 mb-1">
            Time{pbByDistance[distance] && !touchedTime ? ' · from your PB' : ''}
          </label>
          <TimeFields value={time} onChange={(v) => { setTouchedTime(true); setTime(v); }} showHours={distanceM >= 20000} />
          <p className="text-[11px] text-white/40 mt-1">Enter any recent race or time trial. Edit to calculate from a different result.</p>
        </div>
      </div>

      {valid ? (
        <div className="space-y-3">
          <div className={`rounded-2xl p-4 flex items-baseline justify-between ${GLASS}`}>
            <span className="text-sm text-white/60">Your VDOT</span>
            <span className="text-3xl font-bold text-[#c0c1ff]">{result.vdot.toFixed(1)}</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {result.zones.map((z) => (
              <div key={z.key} className="rounded-xl border border-white/10 bg-[#161616]/70 backdrop-blur-xl px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      <span className="text-[#c0c1ff]">Z{z.key}</span> {z.label}
                    </p>
                    <p className="text-[11px] text-white/40">{z.sub}</p>
                  </div>
                  <div className="text-right">
                    {z.kind === 'range' ? (
                      <p className="text-sm font-mono text-white">{pace(z.paceFast)} to {pace(z.paceSlow)}<span className="text-white/40 text-xs"> /km</span></p>
                    ) : z.kind === 'ceiling' ? (
                      <p className="text-sm font-mono text-white">{pace(z.pace)}<span className="text-white/40 text-xs"> /km or slower</span></p>
                    ) : (
                      <p className="text-sm font-mono text-white">{pace(z.pace)}<span className="text-white/40 text-xs"> /km</span></p>
                    )}
                    {z.split400 != null && (
                      <p className="text-[11px] text-white/40 mt-0.5 font-mono">400m {formatClock(z.split400)} · 1000m {formatClock(z.split1000)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-white/40 px-1">Paces are guidance from the Daniels VDOT model. Round to what feels right on the day.</p>
        </div>
      ) : (
        <p className="text-center text-sm text-white/40 py-8">Pick a distance and enter a time to see your zones.</p>
      )}
    </div>
  );
}

// ── Points (World Athletics) tab ─────────────────────────────────────────────
function genderFromUser(user) {
  const g = (user?.gender || '').toLowerCase();
  if (g.startsWith('f') || g.startsWith('w')) return 'women';
  return 'men';
}

function PointsTab() {
  const { user } = useAuth();
  const [gender, setGender] = useState(genderFromUser(user));
  const [eventId, setEventId] = useState('100m');
  const [time, setTime] = useState({ h: '', m: '', s: '' });
  const [mark, setMark] = useState(''); // metres (field) or points (combined)

  const groups = useMemo(() => eventsByCategory(gender), [gender]);
  const event = EVENT_BY_ID[eventId];

  // Switching gender: if the current event isn't offered for it, fall back to
  // the first available event (handled here, not in an effect).
  const pickGender = (g) => {
    setGender(g);
    const ev = EVENT_BY_ID[eventId];
    if (!ev || !ev[g]) {
      const first = eventsByCategory(g)[0]?.events[0];
      if (first) setEventId(first.id);
    }
  };

  const resultValue = useMemo(() => {
    if (!event) return 0;
    if (event.type === 'time') return parseHMS(time);
    return parseFloat(mark) || 0; // distance (m) or combined points
  }, [event, time, mark]);

  const points = pointsFor(eventId, gender, resultValue);

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-4 space-y-3 ${GLASS}`}>
        <div className="flex gap-2">
          {['men', 'women'].map((g) => (
            <button
              key={g}
              onClick={() => pickGender(g)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold capitalize transition ${gender === g ? 'bg-[#c0c1ff] text-black' : 'bg-white/5 text-white/60 hover:text-white'}`}
            >
              {g}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs text-white/50 mb-1">Event</label>
          <select className={INPUT} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g.category} label={g.label}>
                {g.events.map((ev) => (
                  <option key={ev.id} value={ev.id} className="bg-blue-950 text-white">{ev.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-white/50 mb-1">
            {event?.type === 'time' ? 'Time' : event?.type === 'distance' ? 'Mark (metres)' : 'Points'}
          </label>
          {event?.type === 'time' ? (
            <TimeFields value={time} onChange={setTime} showHours />
          ) : (
            <input
              className={INPUT}
              inputMode="decimal"
              placeholder={event?.type === 'distance' ? 'e.g. 7.85' : 'e.g. 8000'}
              value={mark}
              onChange={(e) => setMark(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          )}
        </div>
      </div>

      {points != null ? (
        <div className={`rounded-2xl p-5 text-center ${GLASS}`}>
          <p className="text-sm text-white/60">{event?.label}</p>
          <p className="text-5xl font-bold text-[#c0c1ff] mt-1">{points}</p>
          <p className="text-xs text-white/40 mt-1">World Athletics points</p>
        </div>
      ) : (
        <p className="text-center text-sm text-white/40 py-8">Enter a result to see the World Athletics points.</p>
      )}
      <p className="text-[11px] text-white/40 px-1">Based on the World Athletics Scoring Tables (2025 edition).</p>
    </div>
  );
}

export default function CalculatorPage() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') === 'points' ? 'points' : 'zones';
  const [active, setActive] = useState(tabParam);
  const initialDistance = parseInt(params.get('distance'), 10) || null;

  const onTab = (v) => {
    setActive(v);
    const next = new URLSearchParams(params);
    next.set('tab', v);
    setParams(next, { replace: true });
  };

  return (
    <>
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />

      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white">Running calculator</h1>
        <Tabs
          tabs={[{ value: 'zones', label: 'Training zones' }, { value: 'points', label: 'Points' }]}
          active={active}
          onChange={onTab}
        />
        {active === 'zones' ? <ZonesTab initialDistance={initialDistance} /> : <PointsTab />}
      </div>
    </>
  );
}
