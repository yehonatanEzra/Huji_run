import { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import Modal from './ui/Modal';
import Spinner from './ui/Spinner';
import { getMyActivityDetail, getAthleteActivityDetail } from '../api/strava';

// ── Formatting helpers ───────────────────────────────────────────────────────

function formatTime(seconds) {
  if (seconds == null) return '—';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${sec}`;
  return `${m}:${sec}`;
}

function formatPace(secondsPerKm) {
  if (!secondsPerKm || !isFinite(secondsPerKm)) return '—';
  const m = Math.floor(secondsPerKm / 60);
  const s = String(Math.round(secondsPerKm % 60)).padStart(2, '0');
  return `${m}:${s} /km`;
}

function paceFromSplit(distance_m, moving_time_s) {
  if (!distance_m || !moving_time_s) return null;
  return moving_time_s / (distance_m / 1000);
}

// ── Card components ──────────────────────────────────────────────────────────

const CARD = 'w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-white';
const SECTION_LABEL = 'text-[10px] uppercase tracking-widest text-white/55 font-semibold mb-3';

function DescriptionCard({ activity }) {
  const km = (activity.distance_m / 1000).toFixed(2);
  const time = formatTime(activity.moving_time_s);
  const elev = Math.round(activity.total_elevation_gain_m || 0);
  const pace = formatPace(paceFromSplit(activity.distance_m, activity.moving_time_s));
  return (
    <div className={CARD}>
      <p className={SECTION_LABEL}>Description</p>
      <p className="text-base font-bold mb-3">{activity.name}</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Stat label="Distance" value={`${km} km`} />
        <Stat label="Time" value={time} />
        <Stat label="Avg pace" value={pace} />
        <Stat label="Elevation" value={`${elev} m`} />
      </div>
      <p className="text-[10px] uppercase tracking-widest text-white/45 font-semibold mb-1">Notes</p>
      {activity.description ? (
        <p className="text-sm text-white/85 whitespace-pre-wrap">{activity.description}</p>
      ) : (
        <p className="text-sm text-white/40 italic">No description.</p>
      )}
    </div>
  );
}

function SplitsCard({ splits }) {
  return (
    <div className={CARD}>
      <p className={SECTION_LABEL}>Splits per km</p>
      {splits.length === 0 ? (
        <p className="text-sm text-white/40 italic">No splits available.</p>
      ) : (
        <div className="overflow-y-auto max-h-72">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-blue-950">
              <tr className="text-white/55 text-left">
                <th className="py-1.5 px-1 font-medium">Km</th>
                <th className="py-1.5 px-1 font-medium">Time</th>
                <th className="py-1.5 px-1 font-medium">Pace</th>
                <th className="py-1.5 px-1 font-medium">Δ Elev</th>
                <th className="py-1.5 px-1 font-medium text-right">HR</th>
              </tr>
            </thead>
            <tbody>
              {splits.map((s, i) => {
                const pace = paceFromSplit(s.distance_m, s.moving_time_s);
                return (
                  <tr key={i} className="border-t border-white/10">
                    <td className="py-1.5 px-1 font-mono text-white/85">{s.split}</td>
                    <td className="py-1.5 px-1 font-mono text-white">{formatTime(s.moving_time_s)}</td>
                    <td className="py-1.5 px-1 font-mono text-blue-200">{formatPace(pace)}</td>
                    <td className="py-1.5 px-1 font-mono text-white/65">{s.elevation_diff_m != null ? `${s.elevation_diff_m > 0 ? '+' : ''}${Math.round(s.elevation_diff_m)}m` : '—'}</td>
                    <td className="py-1.5 px-1 font-mono text-white/65 text-right">{s.average_heartrate ? Math.round(s.average_heartrate) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LapsCard({ laps }) {
  return (
    <div className={CARD}>
      <p className={SECTION_LABEL}>Laps</p>
      <div className="overflow-y-auto max-h-72">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-blue-950">
            <tr className="text-white/55 text-left">
              <th className="py-1.5 px-1 font-medium">#</th>
              <th className="py-1.5 px-1 font-medium">Dist</th>
              <th className="py-1.5 px-1 font-medium">Time</th>
              <th className="py-1.5 px-1 font-medium">Pace</th>
              <th className="py-1.5 px-1 font-medium text-right">HR</th>
            </tr>
          </thead>
          <tbody>
            {laps.map((l, i) => {
              const pace = paceFromSplit(l.distance_m, l.moving_time_s);
              const distLabel = l.distance_m >= 1000
                ? `${(l.distance_m / 1000).toFixed(2)} km`
                : `${Math.round(l.distance_m)} m`;
              return (
                <tr key={i} className="border-t border-white/10">
                  <td className="py-1.5 px-1 font-mono text-white/85">{l.lap_index}</td>
                  <td className="py-1.5 px-1 font-mono text-white">{distLabel}</td>
                  <td className="py-1.5 px-1 font-mono text-white">{formatTime(l.moving_time_s)}</td>
                  <td className="py-1.5 px-1 font-mono text-blue-200">{formatPace(pace)}</td>
                  <td className="py-1.5 px-1 font-mono text-white/65 text-right">{l.average_heartrate ? Math.round(l.average_heartrate) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BestEffortsCard({ efforts }) {
  return (
    <div className={CARD}>
      <p className={SECTION_LABEL}>Best efforts</p>
      <div className="space-y-1.5">
        {efforts.map((e, i) => (
          <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 ${e.is_pr ? 'bg-amber-400/20 border border-amber-400/40' : 'bg-white/5 border border-white/10'}`}>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{e.name}</span>
              {e.is_pr && <span className="text-[10px] font-bold bg-amber-400 text-black px-1.5 py-0.5 rounded">🏆 PR</span>}
            </div>
            <span className="font-mono text-blue-200">{formatTime(e.elapsed_time_s)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AveragesCard({ activity }) {
  const items = [];
  if (activity.average_heartrate) items.push({ label: 'Avg HR', value: `${Math.round(activity.average_heartrate)} bpm` });
  if (activity.max_heartrate) items.push({ label: 'Max HR', value: `${Math.round(activity.max_heartrate)} bpm` });
  if (activity.average_cadence) items.push({ label: 'Avg cadence', value: `${Math.round(activity.average_cadence * 2)} spm` });
  const pace = paceFromSplit(activity.distance_m, activity.moving_time_s);
  if (pace) items.push({ label: 'Avg pace', value: formatPace(pace) });
  if (activity.total_elevation_gain_m != null) items.push({ label: 'Elevation', value: `${Math.round(activity.total_elevation_gain_m)} m` });
  if (activity.calories) items.push({ label: 'Calories', value: `${Math.round(activity.calories)}` });

  return (
    <div className={CARD}>
      <p className={SECTION_LABEL}>Averages</p>
      {items.length === 0 ? (
        <p className="text-sm text-white/40 italic">No averages recorded.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((it, i) => <Stat key={i} label={it.label} value={it.value} />)}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-white/45 font-semibold mb-0.5">{label}</p>
      <p className="text-base font-bold text-white font-mono">{value}</p>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function StravaActivityDetail({ activityId, athleteId, onClose }) {
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const carouselRef = useRef(null);
  const cardRefs = useRef([]);

  useEffect(() => {
    setLoading(true);
    setError('');
    setActivity(null);
    const promise = athleteId
      ? getAthleteActivityDetail(athleteId, activityId)
      : getMyActivityDetail(activityId);
    promise
      .then(({ data }) => setActivity(data))
      .catch((err) => setError(err?.response?.data?.detail || 'Could not load activity'))
      .finally(() => setLoading(false));
  }, [activityId, athleteId]);

  // Build the list of cards to render, skipping empty ones
  const cards = [];
  if (activity) {
    cards.push({ key: 'description', el: <DescriptionCard activity={activity} /> });
    cards.push({ key: 'splits', el: <SplitsCard splits={activity.splits || []} /> });
    if ((activity.laps || []).length > 1) {
      cards.push({ key: 'laps', el: <LapsCard laps={activity.laps} /> });
    }
    if ((activity.best_efforts || []).length > 0) {
      cards.push({ key: 'best_efforts', el: <BestEffortsCard efforts={activity.best_efforts} /> });
    }
    cards.push({ key: 'averages', el: <AveragesCard activity={activity} /> });
  }

  // Track scroll position → update active dot
  const handleScroll = () => {
    const el = carouselRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeIdx) setActiveIdx(idx);
  };

  const jumpTo = (i) => {
    const card = cardRefs.current[i];
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  };

  const titleDate = activity?.start_date_local
    ? format(new Date(activity.start_date_local), 'EEE, MMM d')
    : '';

  return (
    <Modal
      open
      onClose={onClose}
      title={
        activity ? (
          <>
            {activity.name}
            <span className="block text-xs font-normal text-white/55 mt-0.5">{titleDate}</span>
          </>
        ) : 'Activity'
      }
      panelClassName="bg-gradient-to-b from-blue-950 to-indigo-950 border-t border-white/10"
    >
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : error ? (
        <p className="text-sm text-red-300 text-center py-8">{error}</p>
      ) : activity ? (
        <>
          {/* Sport type pill */}
          <div className="flex items-center gap-2 -mt-2 mb-3">
            <span className="text-[10px] font-semibold bg-orange-400/20 border border-orange-400/30 text-orange-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
              🏃 {activity.type}
            </span>
          </div>

          {/* Swipeable card carousel — each slide is exactly carousel-wide */}
          <div
            ref={carouselRef}
            onScroll={handleScroll}
            className="flex overflow-x-auto snap-x snap-mandatory pb-1 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {cards.map((c, i) => (
              <div
                key={c.key}
                ref={(el) => (cardRefs.current[i] = el)}
                className="w-full shrink-0 snap-start flex"
              >
                {c.el}
              </div>
            ))}
          </div>

          {/* Dots */}
          <div className="flex justify-center gap-1.5 mt-3">
            {cards.map((c, i) => (
              <button
                key={c.key}
                onClick={() => jumpTo(i)}
                aria-label={`Show ${c.key}`}
                className={`rounded-full transition-all ${
                  i === activeIdx ? 'bg-white w-2.5 h-2.5' : 'bg-white/30 w-1.5 h-1.5 hover:bg-white/50'
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </Modal>
  );
}
