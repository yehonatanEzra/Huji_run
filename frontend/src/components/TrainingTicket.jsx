import { format } from 'date-fns';
import { NoiseBackground } from './ui/NoiseBackground';

const TYPE = {
  simple:    { label: 'Other',     color: 'bg-gray-100 text-gray-700' },
  easy:      { label: 'Easy run',  color: 'bg-emerald-100 text-emerald-700' },
  rest:      { label: 'Rest day',  color: 'bg-slate-100 text-slate-700' },
  tempo:     { label: 'Tempo',     color: 'bg-orange-100 text-orange-700' },
  long:      { label: 'Long run',  color: 'bg-purple-100 text-purple-700' },
  intervals: { label: 'Intervals', color: 'bg-red-100 text-red-700' },
  fartlek:   { label: 'Fartlek',   color: 'bg-pink-100 text-pink-700' },
  race:      { label: 'Race',      color: 'bg-indigo-100 text-indigo-700' },
};

function pickWorkout(today) {
  if (!today) return null;
  if (today.individual_target?.override_group) return { kind: 'personal', w: today.individual_target };
  if (today.group_workout) return { kind: 'group', w: today.group_workout };
  if (today.individual_target) return { kind: 'personal', w: today.individual_target };
  return null;
}

export default function TrainingTicket({ today, weekKm, runs, lastRace, group, onOpenWorkout, hasBgImage = false }) {
  const picked = pickWorkout(today);
  const workout = picked?.w;
  const wt = workout?.workout_type || 'simple';
  const isRace = wt === 'race';
  const isStructured = ['tempo', 'long', 'intervals', 'fartlek', 'race'].includes(wt);
  const middleLabel = wt === 'race' ? 'Race' : 'Main';
  const typeMeta = TYPE[wt] || TYPE.simple;

  const dateStr = format(new Date(), 'EEEE, MMM d');
  const title = workout ? (workout.title || typeMeta.label) : '';
  const titleDisplay = isRace ? `🏁 ${title}` : title;

  const log = today?.workout_log;
  const status = log?.status;
  const reported = !!log;

  // Glass-mode theme — all conditional classes computed here so the JSX stays clean.
  // ↓ TUNE CARD TRANSPARENCY HERE — raise white/XX to make more opaque, lower to show more bg
  const g = hasBgImage;
  const bodyBg     = g ? 'bg-white/25 backdrop-blur-md'
                       : isRace ? 'bg-indigo-50' : 'bg-white';
  const stubBg     = g ? 'bg-black/30 backdrop-blur-sm'
                       : isRace ? 'bg-indigo-100/60' : 'bg-blue-50';
  const cardRing   = g ? 'ring-white/25' : 'ring-gray-200';
  const notchBg    = g ? 'bg-transparent' : 'bg-blue-50';
  const divider    = g ? 'border-white/30' : 'border-gray-300';
  const logoText   = g ? 'text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]' : 'text-blue-700';
  const titleGrad  = isRace
    ? (g ? 'bg-gradient-to-br from-white to-indigo-200' : 'bg-gradient-to-br from-indigo-700 to-purple-600')
    : (g ? 'bg-gradient-to-br from-white to-blue-200'   : 'bg-gradient-to-br from-gray-900 to-blue-600');
  // ↓ TUNE TEXT COLORS HERE for glass mode (right side of each ternary)
  const metaText   = g ? 'text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]'  : 'text-gray-500';
  const bodyText   = g ? 'text-white    [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]'  : 'text-gray-700';
  const emptyText  = g ? 'text-white/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]'  : 'text-gray-400';
  const labelText  = g ? 'text-white/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]'  : 'text-gray-400';
  const bigNum     = g ? 'text-white    [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]'  : 'text-gray-900';
  const statVal    = g ? 'text-white    [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]'  : 'text-gray-900';
  const statLbl    = g ? 'text-white/75 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]'  : 'text-gray-500';
  const raceName   = g ? 'text-white    [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]'  : 'text-gray-900';
  const raceTime   = g ? 'text-blue-200 [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]'  : 'text-indigo-700';
  const noReport   = g ? 'text-white/65 italic [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]' : 'text-gray-400 italic';

  const ctaLabel = workout ? "Open today's workout" : 'Open training calendar';

  const body = (() => {
    if (!workout) return null;
    if (isStructured) {
      return (
        <div className="space-y-1.5 text-sm">
          {workout.warmup      && <p><span className={`text-[10px] uppercase tracking-wider ${labelText}`}>Warm-up · </span><span className={`whitespace-pre-wrap ${bodyText}`}>{workout.warmup}</span></p>}
          {workout.main_session && <p><span className={`text-[10px] uppercase tracking-wider ${labelText}`}>{middleLabel} · </span><span className={`whitespace-pre-wrap ${bodyText}`}>{workout.main_session}</span></p>}
          {workout.cooldown    && <p><span className={`text-[10px] uppercase tracking-wider ${labelText}`}>Cool-down · </span><span className={`whitespace-pre-wrap ${bodyText}`}>{workout.cooldown}</span></p>}
        </div>
      );
    }
    const content = workout.content ?? workout.note;
    return content ? <p className={`text-sm whitespace-pre-wrap ${bodyText}`}>{content}</p> : null;
  })();

  return (
    <div className="w-full max-w-md mx-auto [perspective:1000px]">
      <div className="relative group">
        {/* Holographic shine overlay */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
          style={{
            background:
              'linear-gradient(115deg, transparent 0%, transparent 40%, rgba(255,255,255,0.25) 45%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0.25) 55%, transparent 60%, transparent 100%)',
            backgroundSize: '250% 250%',
            backgroundPosition: '100% 100%',
            mixBlendMode: 'overlay',
          }}
        />

        <div
          className={`relative rounded-2xl shadow-xl ring-1 ${cardRing} overflow-hidden transition-transform duration-500 ease-out group-hover:[transform:rotateX(3deg)_rotateY(-3deg)_scale(1.01)]`}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* TOP — body */}
          <div className={`relative px-4 pt-3 pb-4 ${bodyBg}`}>
            {/* Logo + type pill */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-extrabold tracking-tight ${logoText}`}>HUJI RUN</span>
              </div>
              {workout && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${typeMeta.color}`}>
                  {typeMeta.label}
                </span>
              )}
            </div>

            {/* Title */}
            {workout && (
              <h1 className={`text-2xl font-black leading-tight uppercase ${titleGrad} bg-clip-text text-transparent`}>
                {titleDisplay}
              </h1>
            )}
            <p className={`text-xs mt-0.5 mb-2 ${metaText}`}>
              {dateStr}
              {group && <> · {group.name}</>}
            </p>

            {/* Body */}
            {workout ? body : (
              <p className={`text-sm italic ${emptyText}`}>
                {wt === 'rest' ? 'Rest day — nothing scheduled.' : 'No workout scheduled for today.'}
              </p>
            )}
          </div>

          {/* PERFORATION with side notches */}
          <div className="relative h-4">
            <div className={`absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full ${notchBg}`} />
            <div className={`absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full ${notchBg}`} />
            <div className={`absolute left-4 right-4 top-1/2 border-t-2 border-dashed ${divider}`} />
          </div>

          {/* BOTTOM — stub */}
          <div className={`relative px-4 py-3 ${stubBg}`}>
            <div className="grid grid-cols-2 gap-4 items-center">
              {/* Left: weekly km */}
              <div>
                <p className={`text-[10px] uppercase tracking-widest font-semibold ${metaText}`}>Km this week</p>
                <p className={`text-3xl font-extrabold leading-none mt-0.5 ${bigNum}`}>
                  {weekKm.toFixed(1)}
                </p>
              </div>

              {/* Right: status */}
              <div className="text-right">
                <p className={`text-[10px] uppercase tracking-widest font-semibold ${metaText}`}>Today</p>
                {reported ? (
                  <p className={`mt-1 inline-block text-xs font-bold px-2.5 py-1 rounded-full ${
                    status === 'completed' ? 'bg-green-100 text-green-700' :
                    status === 'partial'   ? 'bg-yellow-100 text-yellow-700' :
                                             'bg-red-100 text-red-700'
                  }`}>
                    {status === 'completed' ? '✓ Completed' : status === 'partial' ? '½ Partial' : '✗ Missed'}
                  </p>
                ) : (
                  <p className={`mt-1 text-xs ${noReport}`}>Not reported</p>
                )}
              </div>
            </div>

            {/* Stat row */}
            <div className={`grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-dashed ${divider}`}>
              <Stat label="Runs this week"  value={runs.week}  valClass={statVal} lblClass={statLbl} />
              <Stat label="Runs this month" value={runs.month} valClass={statVal} lblClass={statLbl} />
              <Stat label="All-time"        value={runs.total} valClass={statVal} lblClass={statLbl} />
            </div>

            {/* Last race */}
            <div className={`mt-3 pt-3 border-t border-dashed ${divider}`}>
              <p className={`text-[10px] uppercase tracking-widest font-semibold mb-1 ${metaText}`}>Last race</p>
              {lastRace ? (
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`font-bold truncate ${raceName}`}>{lastRace.name}</p>
                    <p className={`text-[11px] ${metaText}`}>
                      {format(new Date(lastRace.date + 'T00:00'), 'MMM d, yyyy')} · {lastRace.distance_label}
                    </p>
                  </div>
                  <p className={`text-lg font-extrabold font-mono whitespace-nowrap ${raceTime}`}>
                    {lastRace.result_time_str}
                  </p>
                </div>
              ) : (
                <p className={`text-xs italic ${emptyText}`}>No race yet — your first will show up here.</p>
              )}
            </div>
          </div>
        </div>

        {/* CTA — full width, outside the ticket but right under it */}
        <NoiseBackground
          containerClassName="mt-2 w-full rounded-xl p-[2px]"
          gradientColors={
            isRace
              ? ['rgb(99,102,241)', 'rgb(168,85,247)', 'rgb(236,72,153)']
              : ['rgb(37,99,235)', 'rgb(99,102,241)', 'rgb(139,92,246)']
          }
        >
          <button
            onClick={onOpenWorkout}
            className="w-full rounded-[10px] bg-black/70 hover:bg-black/55 backdrop-blur-sm py-2 text-sm font-semibold tracking-wide text-white transition active:scale-[0.98]"
          >
            {ctaLabel}
          </button>
        </NoiseBackground>
      </div>
    </div>
  );
}

function Stat({ label, value, valClass, lblClass }) {
  return (
    <div className="text-center">
      <p className={`text-base font-extrabold leading-none ${valClass}`}>{value}</p>
      <p className={`text-[9px] uppercase tracking-wider mt-0.5 ${lblClass}`}>{label}</p>
    </div>
  );
}
