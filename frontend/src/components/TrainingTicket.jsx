import { format } from 'date-fns';

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

export default function TrainingTicket({ today, weekKm, runs, lastRace, group, onOpenWorkout }) {
  const picked = pickWorkout(today);
  const workout = picked?.w;
  const wt = workout?.workout_type || 'simple';
  const isRace = wt === 'race';
  const isStructured = ['tempo', 'long', 'intervals', 'fartlek', 'race'].includes(wt);
  const middleLabel = wt === 'race' ? 'Race' : 'Main';
  const typeMeta = TYPE[wt] || TYPE.simple;

  const dateStr = format(new Date(), 'EEEE, MMM d');
  const title = workout?.title || typeMeta.label;
  const titleDisplay = isRace ? `🏁 ${title}` : title;

  const log = today?.workout_log;
  const status = log?.status;
  const reported = !!log;

  const body = (() => {
    if (!workout) return null;
    if (isStructured) {
      return (
        <div className="space-y-1.5 text-sm">
          {workout.warmup && <p><span className="text-[10px] uppercase tracking-wider text-gray-400">Warm-up · </span><span className="whitespace-pre-wrap">{workout.warmup}</span></p>}
          {workout.main_session && <p><span className="text-[10px] uppercase tracking-wider text-gray-400">{middleLabel} · </span><span className="whitespace-pre-wrap">{workout.main_session}</span></p>}
          {workout.cooldown && <p><span className="text-[10px] uppercase tracking-wider text-gray-400">Cool-down · </span><span className="whitespace-pre-wrap">{workout.cooldown}</span></p>}
        </div>
      );
    }
    const content = workout.content ?? workout.note;
    return content ? <p className="text-sm whitespace-pre-wrap text-gray-700">{content}</p> : null;
  })();

  const bodyBg = isRace ? 'bg-indigo-50' : 'bg-white';
  const stubBg = isRace ? 'bg-indigo-100/60' : 'bg-gray-50';
  const titleGradient = isRace
    ? 'bg-gradient-to-br from-indigo-700 to-purple-600'
    : 'bg-gradient-to-br from-gray-900 to-indigo-600';
  // Notch (perforation hole) color must match the *outer* page background so it
  // looks like the card was actually punched through. Page bg is gray-50.
  const notchBg = 'bg-gray-50';
  // Inside the stub the notches need to match the stub bg, not the body bg
  const innerNotchBg = isRace ? 'bg-indigo-100' : 'bg-gray-50';

  const ctaLabel = workout ? "Open today's workout" : 'Open training calendar';

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
          className="relative rounded-2xl shadow-xl ring-1 ring-gray-200 overflow-hidden transition-transform duration-500 ease-out group-hover:[transform:rotateX(3deg)_rotateY(-3deg)_scale(1.01)]"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* TOP — body */}
          <div className={`relative px-6 pt-5 pb-6 ${bodyBg}`}>
            {/* Logo + type pill */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                <span className="text-lg">🎟️</span>
                <span className="text-xs font-extrabold tracking-tight text-blue-700">HUJI RUN</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${typeMeta.color}`}>
                {typeMeta.label}
              </span>
            </div>

            {/* Title */}
            <h1 className={`text-3xl font-black leading-tight uppercase ${titleGradient} bg-clip-text text-transparent`}>
              {titleDisplay}
            </h1>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              {dateStr}
              {group && <> · {group.name}</>}
            </p>

            {/* Body */}
            {workout ? body : (
              <p className="text-sm text-gray-400 italic">
                {wt === 'rest' ? 'Rest day — nothing scheduled.' : 'No workout scheduled for today.'}
              </p>
            )}
          </div>

          {/* PERFORATION with side notches */}
          <div className="relative h-4">
            <div className={`absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full ${notchBg}`} />
            <div className={`absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full ${notchBg}`} />
            <div className="absolute left-4 right-4 top-1/2 border-t-2 border-dashed border-gray-300" />
          </div>

          {/* BOTTOM — stub */}
          <div className={`relative px-6 py-5 ${stubBg}`}>
            <div className="grid grid-cols-2 gap-4 items-center">
              {/* Left: weekly km */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Km this week</p>
                <p className="text-4xl font-extrabold text-gray-900 leading-none mt-1">
                  {weekKm.toFixed(1)}
                </p>
              </div>

              {/* Right: status */}
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Today</p>
                {reported ? (
                  <p className={`mt-1 inline-block text-xs font-bold px-2.5 py-1 rounded-full ${
                    status === 'completed' ? 'bg-green-100 text-green-700' :
                    status === 'partial'   ? 'bg-yellow-100 text-yellow-700' :
                                             'bg-red-100 text-red-700'
                  }`}>
                    {status === 'completed' ? '✓ Completed' : status === 'partial' ? '½ Partial' : '✗ Missed'}
                  </p>
                ) : (
                  <p className="mt-1 text-xs italic text-gray-400">Not reported</p>
                )}
              </div>
            </div>

            {/* Stat row */}
            <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-dashed border-gray-300">
              <Stat label="Runs this week"  value={runs.week} />
              <Stat label="Runs this month" value={runs.month} />
              <Stat label="All-time"        value={runs.total} />
            </div>

            {/* Last race */}
            <div className="mt-5 pt-4 border-t border-dashed border-gray-300">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-1">Last race</p>
              {lastRace ? (
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">🏁 {lastRace.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {format(new Date(lastRace.date + 'T00:00'), 'MMM d, yyyy')} · {lastRace.distance_label}
                    </p>
                  </div>
                  <p className="text-lg font-extrabold text-indigo-700 font-mono whitespace-nowrap">
                    {lastRace.result_time_str}
                  </p>
                </div>
              ) : (
                <p className="text-xs italic text-gray-400">No race yet — your first will show up here.</p>
              )}
            </div>
          </div>
        </div>

        {/* CTA — full width, outside the ticket but right under it */}
        <button
          onClick={onOpenWorkout}
          className="mt-4 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 rounded-xl shadow-md transition"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-xl font-extrabold text-gray-900 leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-1">{label}</p>
    </div>
  );
}
