import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, subWeeks, addWeeks, subMonths, addMonths, subYears, addYears, isSameMonth } from 'date-fns';
import { getWeek, submitLog } from '../../api/calendar';
import { getMyStravaActivities } from '../../api/strava';
import { useAuth } from '../../contexts/AuthContext';
import StravaActivityDetail from '../../components/StravaActivityDetail';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import WorkoutCommentThread from '../../components/WorkoutCommentThread';
import PageBackground from '../../components/PageBackground';
import { NoiseBackground } from '../../components/ui/NoiseBackground';

export default function CalendarPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isUnpairedAthlete = user?.role === 'athlete' && !user?.coach_id;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('weekly');
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [expandedZoom, setExpandedZoom] = useState(0.75);
  const expandedScrollRef = useRef(null);
  const pinchRef = useRef({ startDist: 0, startZoom: 1 });

  // Pinch-to-zoom on touch + Ctrl/Cmd-scroll on desktop, scoped to the
  // expanded month view's scroll container. The +/− buttons keep working too.
  useEffect(() => {
    if (!monthExpanded) return;
    const el = expandedScrollRef.current;
    if (!el) return;

    const clamp = (v) => +Math.max(0.3, Math.min(1.8, v)).toFixed(2);

    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setExpandedZoom((z) => clamp(z + delta));
    };

    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current.startDist = Math.hypot(dx, dy);
      // Snapshot the zoom at the moment the pinch began
      setExpandedZoom((z) => {
        pinchRef.current.startZoom = z;
        return z;
      });
    };

    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || !pinchRef.current.startDist) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const ratio = newDist / pinchRef.current.startDist;
      setExpandedZoom(clamp(pinchRef.current.startZoom * ratio));
    };

    const onTouchEnd = () => {
      pinchRef.current.startDist = 0;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [monthExpanded]);
  const [logForm, setLogForm] = useState({ status: 'missed', notes: '' });
  const [saving, setSaving] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [autoOpenedToday, setAutoOpenedToday] = useState(false);
  const [stravaActivities, setStravaActivities] = useState(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [selectedStravaActivity, setSelectedStravaActivity] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (view === 'weekly') {
        const { data } = await getWeek(format(currentDate, 'yyyy-MM-dd'));
        setDays(data.days);
      } else {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        const calEnd = startOfWeek(monthEnd, { weekStartsOn: 0 });

        const weeks = [];
        let ws = calStart;
        while (ws <= calEnd) {
          weeks.push(getWeek(format(ws, 'yyyy-MM-dd')));
          ws = addDays(ws, 7);
        }
        const results = await Promise.all(weeks);
        setDays(results.flatMap(r => r.data.days));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [currentDate, view]);

  // Refetch after a global Strava sync
  useEffect(() => {
    const onSync = () => fetchData();
    window.addEventListener('strava-synced', onSync);
    return () => window.removeEventListener('strava-synced', onSync);
  }, [currentDate, view]);

  // Auto-open today's day modal when arriving with ?open=today (from the home page CTA).
  useEffect(() => {
    if (autoOpenedToday) return;
    if (searchParams.get('open') !== 'today') return;
    if (!days.length) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayDay = days.find(d => d.date === today);
    if (todayDay) {
      openDay(todayDay);
      setAutoOpenedToday(true);
      // Strip the query param so back-nav doesn't re-trigger
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    }
  }, [days, searchParams, autoOpenedToday]);

  const openDay = (day) => {
    setSelectedDay(day);
    setStravaActivities(null);
    setStravaLoading(false);
    if (user?.strava_connected) {
      setStravaLoading(true);
      getMyStravaActivities(day.date)
        .then(({ data }) => setStravaActivities(data))
        .catch(() => setStravaActivities([]))
        .finally(() => setStravaLoading(false));
    }
    setLogForm({
      status: day.workout_log?.status || 'missed',
      distance_km: day.workout_log?.distance_km || '',
      notes: day.workout_log?.notes || '',
      manual_override: day.workout_log?.manual_override || false,
    });
  };

  const handleSaveLog = async () => {
    setSaving(true);
    try {
      const payload = {
        date: selectedDay.date,
        status: logForm.status,
        notes: logForm.notes,
        manual_override: !!logForm.manual_override,
      };
      if (logForm.distance_km !== '' && logForm.distance_km != null) {
        payload.distance_km = parseFloat(logForm.distance_km);
      }
      await submitLog(payload);
      setSelectedDay(null);
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => setCurrentDate(view === 'weekly' ? subWeeks(currentDate, 1) : subMonths(currentDate, 1));
  const goForward = () => setCurrentDate(view === 'weekly' ? addWeeks(currentDate, 1) : addMonths(currentDate, 1));

  const ws = startOfWeek(currentDate, { weekStartsOn: 0 });

  const headerLabel = view === 'weekly'
    ? `${format(ws, 'MMM d')} - ${format(addDays(ws, 6), 'MMM d, yyyy')}`
    : format(currentDate, 'MMMM yyyy');

  const renderDayCard = (day) => {
    const isToday = day.date === format(new Date(), 'yyyy-MM-dd');
    const hasLog = day.workout_log;
    const isRace = day.individual_target?.override_group
      ? day.individual_target?.workout_type === 'race'
      : day.group_workout?.workout_type === 'race';
    return (
      <button
        key={day.date}
        onClick={() => openDay(day)}
        className={`w-full text-left p-3 rounded-xl transition hover:shadow-sm backdrop-blur-sm ${
          isRace ? 'border-2 border-indigo-400/70 bg-indigo-200/25' :
          isToday ? 'border border-blue-300/60 bg-blue-200/25' : 'border border-white/30 bg-white/20'
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
            {isRace && <span className="mr-1">🏁</span>}
            {format(new Date(day.date + 'T00:00'), 'EEE, MMM d')}
          </span>
          <div className="flex items-center gap-1.5">
            {day.group_workout?.workout_type && (() => {
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
              const t = TYPE[day.group_workout.workout_type];
              if (!t) return null;
              return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${t.color}`}>{t.label}</span>;
            })()}
            {hasLog?.kudos_count > 0 && (
              <span className="text-xs text-pink-600">👏 {hasLog.kudos_count}</span>
            )}
            {hasLog?.manual_override && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500 text-white px-1.5 py-0.5 rounded"
                title="Manual — not overwritten by Strava"
              >
                Manual
              </span>
            )}
            {hasLog && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                hasLog.status === 'completed' ? 'bg-green-100 text-green-700' :
                hasLog.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {hasLog.status === 'completed' ? 'Done' : hasLog.status === 'partial' ? 'Partial' : 'Missed'}
              </span>
            )}
          </div>
        </div>
        {(() => {
          const t = day.individual_target;
          const gw = day.group_workout;
          const personalOverride = t?.override_group;
          // Personal override → show personal title/body in place of group
          if (personalOverride) {
            const title = t.title || t.note;
            const body = t.note || t.main_session || t.warmup;
            return (
              <>
                {title && <p className="text-sm text-white font-semibold truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{title}</p>}
                {body && body !== title && <p className="text-xs text-white/75 truncate">{body}</p>}
              </>
            );
          }
          // Otherwise: group workout + personal note alongside
          const gwSnippet = gw?.title || gw?.content || gw?.main_session || gw?.warmup;
          return (
            <>
              {gwSnippet && <p className="text-sm text-white font-semibold truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{gwSnippet}</p>}
              {t && (t.title || t.note) && (
                <p className="text-xs text-white/75 mt-1 truncate">
                  Coach note: {t.title || t.note}
                </p>
              )}
            </>
          );
        })()}
      </button>
    );
  };

  const renderMonthGrid = () => {
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return (
      <div>
        <NoiseBackground
          containerClassName="mb-4 w-full rounded-xl p-[2px]"
          gradientColors={['rgb(37,99,235)', 'rgb(99,102,241)', 'rgb(139,92,246)']}
        >
          <button
            onClick={() => setMonthExpanded(true)}
            className="w-full rounded-[10px] bg-black/70 hover:bg-black/55 backdrop-blur-sm py-3 text-sm font-semibold tracking-wide text-white transition active:scale-[0.98]"
          >
            ⛶ Expand monthly view
          </button>
        </NoiseBackground>
        <div className="space-y-4">
        {weeks.map((week, wi) => (
          <div key={wi}>
            <p className="text-xs text-gray-400 mb-1 font-medium">
              {format(new Date(week[0].date + 'T00:00'), 'MMM d')} - {format(new Date(week[6].date + 'T00:00'), 'MMM d')}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {week.map((day) => {
                const isToday = day.date === format(new Date(), 'yyyy-MM-dd');
                const hasLog = day.workout_log;
                const hasWorkout = day.group_workout || day.individual_target;
                const inMonth = new Date(day.date + 'T00:00').getMonth() === currentDate.getMonth();
                  const TYPE_ABBR = {
                    simple:    { abbr: 'Oth',  color: 'bg-gray-100 text-gray-700' },
                    easy:      { abbr: 'Easy', color: 'bg-emerald-100 text-emerald-700' },
                    rest:      { abbr: 'Rest', color: 'bg-slate-100 text-slate-700' },
                    tempo:     { abbr: 'Tem',  color: 'bg-orange-100 text-orange-700' },
                    long:      { abbr: 'Long', color: 'bg-purple-100 text-purple-700' },
                    intervals: { abbr: 'Int',  color: 'bg-red-100 text-red-700' },
                    fartlek:   { abbr: 'Fart', color: 'bg-pink-100 text-pink-700' },
                    race:      { abbr: 'Race', color: 'bg-indigo-100 text-indigo-700' },
                  };
                  // Personal override wins; otherwise show group type
                  const activeType = day.individual_target?.override_group
                    ? day.individual_target?.workout_type
                    : day.group_workout?.workout_type;
                  const typeBadge = activeType ? TYPE_ABBR[activeType] : null;
                  const isRace = activeType === 'race';
                  return (
                  <button
                    key={day.date}
                    onClick={() => openDay(day)}
                    className={`flex flex-col items-center p-1.5 rounded-lg text-xs transition hover:shadow-sm relative ${
                      !inMonth ? 'opacity-40' : ''
                    } ${isRace ? 'border-2 border-indigo-500 bg-indigo-50' :
                       isToday ? 'border border-blue-400 bg-blue-50' : 'border border-gray-200 bg-white'}`}
                  >
                    {isRace && (
                      <span className="absolute top-0.5 left-0.5 text-[10px] leading-none">🏁</span>
                    )}
                    {typeBadge && !isRace && (
                      <span className={`absolute top-0.5 right-0.5 text-[8px] px-1 py-px rounded font-semibold leading-none ${typeBadge.color}`}>
                        {typeBadge.abbr}
                      </span>
                    )}
                    <span className="font-semibold">{format(new Date(day.date + 'T00:00'), 'd')}</span>
                    <span className="text-[10px] text-gray-400">{format(new Date(day.date + 'T00:00'), 'EEE')}</span>
                    <div className="flex gap-0.5 mt-1">
                      {hasWorkout && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                      {hasLog && (
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          hasLog.status === 'completed' ? 'bg-green-400' :
                          hasLog.status === 'partial' ? 'bg-yellow-400' : 'bg-red-400'
                        }`} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        </div>
      </div>
    );
  };

  if (isUnpairedAthlete) {
    return (
      <div className="pb-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center mt-4">
          <div className="text-4xl mb-3">🏃</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No coach yet</h2>
          <p className="text-sm text-gray-600 mb-5">
            Join a coach to start receiving workouts and tracking your training.
          </p>
          <button
            onClick={() => navigate('/find-coach')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-5 rounded-xl"
          >
            Find a coach
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950" />
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20 text-white text-sm font-semibold px-3 py-1.5 rounded-xl transition active:scale-95"
        >
          <span className="text-base leading-none">‹</span> Prev
        </button>
        {view === 'monthly' ? (
          <YearMonthLabel
            currentDate={currentDate}
            onYearChange={(y) => setCurrentDate(new Date(y, currentDate.getMonth(), 1))}
            className="text-sm font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)] tracking-wide"
          />
        ) : (
          <h2 className="text-sm font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)] tracking-wide">
            {headerLabel}
          </h2>
        )}
        <button
          onClick={goForward}
          className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20 text-white text-sm font-semibold px-3 py-1.5 rounded-xl transition active:scale-95"
        >
          Next <span className="text-base leading-none">›</span>
        </button>
      </div>

      <div className="flex rounded-xl overflow-hidden mb-4 bg-white/10 backdrop-blur-sm border border-white/20">
        <button
          onClick={() => setView('weekly')}
          className={`flex-1 py-1.5 text-sm font-semibold transition ${view === 'weekly' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'}`}
        >Weekly</button>
        <button
          onClick={() => setView('monthly')}
          className={`flex-1 py-1.5 text-sm font-semibold transition ${view === 'monthly' ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'}`}
        >Monthly</button>
      </div>


      {!loading && (() => {
        const weekKm = days.reduce((s, d) => s + (d.workout_log?.distance_km || 0), 0);
        return weekKm > 0 ? (
          <div className="flex items-center justify-between bg-blue-600/40 backdrop-blur-sm rounded-lg px-4 py-2 mb-4 border border-blue-400/30">
            <span className="text-sm font-medium text-white/90">
              {view === 'weekly' ? 'Weekly' : 'Monthly'} Volume
            </span>
            <span className="text-lg font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">{weekKm.toFixed(1)} km</span>
          </div>
        ) : null;
      })()}

      {loading ? <Spinner /> : view === 'weekly' ? (
        <div className="space-y-2">
          {days.map(renderDayCard)}
        </div>
      ) : renderMonthGrid()}

      <Modal open={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay ? format(new Date(selectedDay.date + 'T00:00'), 'EEEE, MMM d') : ''} panelClassName="bg-gradient-to-b from-blue-950 to-indigo-950 border-t border-white/10">
        {selectedDay && (
          <div className="space-y-4">
            {selectedDay.group_workout && (() => {
              const gw = selectedDay.group_workout;
              const TYPE_LABELS = { simple: 'Other', easy: 'Easy run', rest: 'Rest day', tempo: 'Tempo', long: 'Long run', intervals: 'Intervals', fartlek: 'Fartlek', race: 'Race' };
              const TYPE_COLOR = {
                simple: 'bg-gray-100 text-gray-700',
                easy: 'bg-emerald-100 text-emerald-700',
                rest: 'bg-slate-100 text-slate-700',
                tempo: 'bg-orange-100 text-orange-700',
                long: 'bg-purple-100 text-purple-700',
                intervals: 'bg-red-100 text-red-700',
                fartlek: 'bg-pink-100 text-pink-700',
                race: 'bg-indigo-100 text-indigo-700',
              };
              const isStructured = ['tempo', 'long', 'intervals', 'fartlek', 'race'].includes(gw.workout_type);
              const middleLabel = gw.workout_type === 'race' ? 'Race' : 'Main';
              const isRaceDay = gw.workout_type === 'race';
              return (
                <div className={`rounded-lg p-3 space-y-2 ${isRaceDay ? 'bg-indigo-400/20 border-2 border-indigo-400/60' : 'bg-white/10 backdrop-blur-sm border border-white/20'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-white/50">Group Workout</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[gw.workout_type] || TYPE_COLOR.simple}`}>
                      {TYPE_LABELS[gw.workout_type] || 'Simple'}
                    </span>
                  </div>
                  {gw.title && <p className="text-base font-semibold text-white">{isRaceDay && '🏁 '}{gw.title}</p>}
                  {!gw.title && isRaceDay && <p className="text-base font-semibold text-white">🏁 Race day</p>}
                  {isStructured ? (
                    <div className="space-y-1.5 text-sm">
                      {gw.warmup && <p><span className="text-xs uppercase tracking-wider text-white/40">Warm-up · </span><span className="whitespace-pre-wrap text-white/85">{gw.warmup}</span></p>}
                      {gw.main_session && <p><span className="text-xs uppercase tracking-wider text-white/40">{middleLabel} · </span><span className="whitespace-pre-wrap text-white/85">{gw.main_session}</span></p>}
                      {gw.cooldown && <p><span className="text-xs uppercase tracking-wider text-white/40">Cool-down · </span><span className="whitespace-pre-wrap text-white/85">{gw.cooldown}</span></p>}
                    </div>
                  ) : (
                    gw.content && <p className="text-sm whitespace-pre-wrap text-white/85">{gw.content}</p>
                  )}
                </div>
              );
            })()}
            {selectedDay.individual_target && (() => {
              const t = selectedDay.individual_target;
              const TYPE_LABELS = { simple: 'Other', easy: 'Easy run', rest: 'Rest day', tempo: 'Tempo', long: 'Long run', intervals: 'Intervals', fartlek: 'Fartlek', race: 'Race' };
              const TYPE_COLOR = {
                simple: 'bg-gray-100 text-gray-700',
                easy: 'bg-emerald-100 text-emerald-700',
                rest: 'bg-slate-100 text-slate-700',
                tempo: 'bg-orange-100 text-orange-700',
                long: 'bg-purple-100 text-purple-700',
                intervals: 'bg-red-100 text-red-700',
                fartlek: 'bg-pink-100 text-pink-700',
                race: 'bg-indigo-100 text-indigo-700',
              };
              const isStructured = ['tempo', 'long', 'intervals', 'fartlek', 'race'].includes(t.workout_type);
              const middleLabel = t.workout_type === 'race' ? 'Race' : 'Main';
              const isRaceT = t.workout_type === 'race';
              return (
                <div className={`rounded-lg p-3 space-y-2 ${isRaceT ? 'bg-indigo-400/20 border-2 border-indigo-400/60' : 'bg-blue-400/15 backdrop-blur-sm border border-blue-300/25'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-blue-300">Coach's workout for you</p>
                    {t.workout_type && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[t.workout_type] || TYPE_COLOR.simple}`}>
                        {TYPE_LABELS[t.workout_type] || 'Other'}
                      </span>
                    )}
                  </div>
                  {t.title && <p className="text-base font-semibold text-white">{isRaceT && '🏁 '}{t.title}</p>}
                  {!t.title && isRaceT && <p className="text-base font-semibold text-white">🏁 Race day</p>}
                  {isStructured ? (
                    <div className="space-y-1.5 text-sm">
                      {t.warmup && <p><span className="text-xs uppercase tracking-wider text-white/40">Warm-up · </span><span className="whitespace-pre-wrap text-white/85">{t.warmup}</span></p>}
                      {t.main_session && <p><span className="text-xs uppercase tracking-wider text-white/40">{middleLabel} · </span><span className="whitespace-pre-wrap text-white/85">{t.main_session}</span></p>}
                      {t.cooldown && <p><span className="text-xs uppercase tracking-wider text-white/40">Cool-down · </span><span className="whitespace-pre-wrap text-white/85">{t.cooldown}</span></p>}
                    </div>
                  ) : (
                    t.note && <p className="text-sm whitespace-pre-wrap text-white/85">{t.note}</p>
                  )}
                </div>
              );
            })()}

            {selectedDay.workout_log && selectedDay.workout_log.kudos_count > 0 && (
              <div className="flex items-center gap-1.5 bg-pink-400/15 border border-pink-400/25 rounded-lg px-3 py-2">
                <span className="text-lg">👏</span>
                <span className="text-sm font-medium text-pink-300">
                  {selectedDay.workout_log.kudos_count} kudos
                </span>
              </div>
            )}

            <div className="border-t border-white/15 pt-4">
              <p className="text-sm font-medium text-white mb-2">Workout Report</p>
              <div className="flex gap-2 mb-3">
                {[
                  { value: 'completed', label: 'Completed', bg: 'bg-green-100 text-green-700 border-green-300', active: 'bg-green-600 text-white border-green-600' },
                  { value: 'partial', label: 'Half', bg: 'bg-yellow-50 text-yellow-700 border-yellow-300', active: 'bg-yellow-500 text-white border-yellow-500' },
                  { value: 'missed', label: 'Missed', bg: 'bg-red-50 text-red-700 border-red-300', active: 'bg-red-600 text-white border-red-600' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setLogForm({ ...logForm, status: opt.value })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      logForm.status === opt.value ? opt.active : opt.bg
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {logForm.status !== 'missed' && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-white/60 whitespace-nowrap">Distance (km)</label>
                  <div className="relative flex-1 min-w-0">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="e.g. 8.5"
                      value={logForm.distance_km}
                      onChange={(e) => setLogForm({ ...logForm, distance_km: e.target.value })}
                      className={`w-full bg-white/10 border border-white/20 rounded-lg pl-3 py-2 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-blue-400 ${user?.strava_connected ? 'pr-20' : 'pr-3'}`}
                    />
                    {user?.strava_connected && (
                      <button
                        type="button"
                        onClick={() => setLogForm({ ...logForm, manual_override: !logForm.manual_override })}
                        title={logForm.manual_override
                          ? 'Manual: Strava sync will not overwrite this day'
                          : 'Tap to lock — Strava sync will skip this day'}
                        className={`absolute right-1 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition ${
                          logForm.manual_override
                            ? 'bg-emerald-500 text-white shadow'
                            : 'bg-white/10 text-white/55 hover:bg-white/20 hover:text-white'
                        }`}
                      >
                        Manual
                      </button>
                    )}
                  </div>
                </div>
              )}
              <textarea
                placeholder="How did it go? Any notes..."
                value={logForm.notes}
                onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
                rows={3}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={handleSaveLog}
                disabled={saving}
                className="w-full mt-3 bg-blue-500 hover:bg-blue-400 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 transition"
              >
                {saving ? 'Saving...' : 'Save Report'}
              </button>
            </div>

            {user?.strava_connected && (
              <div className="border-t border-white/15 pt-3">
                <p className="text-[10px] uppercase tracking-widest text-white/45 font-semibold mb-2">Strava activities</p>
                {stravaLoading ? (
                  <p className="text-xs text-white/40 italic">Loading…</p>
                ) : stravaActivities === null ? null
                : stravaActivities.length === 0 ? (
                  <p className="text-xs text-white/40 italic">No Strava activities this day</p>
                ) : stravaActivities.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedStravaActivity(a)}
                    className="block w-full text-left hover:brightness-125 active:scale-[0.99] transition"
                  >
                    <StravaActivityRow activity={a} />
                  </button>
                ))}
              </div>
            )}

            {selectedDay.workout_log?.id ? (
              <WorkoutCommentThread workoutLogId={selectedDay.workout_log.id} />
            ) : (
              <div className="border-t border-white/15 pt-3">
                <p className="text-xs text-white/35 italic">💬 Save a report to enable comments with your coach.</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Expanded month view */}
      <Modal
        open={monthExpanded}
        onClose={() => setMonthExpanded(false)}
        title="Training log"
        fullScreen
        panelClassName="bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950"
      >
        <div>
          {/* Zoom controls */}
          <div className="flex items-center justify-end gap-2 mb-2">
            <span className="text-xs text-white/60">Zoom</span>
            <button
              onClick={() => setExpandedZoom(z => Math.max(0.3, +(z - 0.05).toFixed(2)))}
              disabled={expandedZoom <= 0.3}
              className="w-7 h-7 rounded border border-white/20 bg-white/5 text-white text-sm font-bold hover:bg-white/15 disabled:opacity-30 transition"
            >−</button>
            <span className="text-xs font-mono w-10 text-center text-white/85">{Math.round(expandedZoom * 100)}%</span>
            <button
              onClick={() => setExpandedZoom(z => Math.min(1.8, +(z + 0.05).toFixed(2)))}
              disabled={expandedZoom >= 1.8}
              className="w-7 h-7 rounded border border-white/20 bg-white/5 text-white text-sm font-bold hover:bg-white/15 disabled:opacity-30 transition"
            >+</button>
          </div>

          {/* Month + year navigation at the top */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="text-blue-300 hover:text-blue-200 text-sm transition"
            >&larr; Prev</button>
            <YearMonthLabel
              currentDate={currentDate}
              onYearChange={(y) => setCurrentDate(new Date(y, currentDate.getMonth(), 1))}
              className="text-sm font-semibold text-white"
            />
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="text-blue-300 hover:text-blue-200 text-sm transition"
            >Next &rarr;</button>
          </div>

          <div
            ref={expandedScrollRef}
            className="overflow-x-auto -mx-2"
            style={{ touchAction: 'pan-x pan-y' }}
          >
            <div className="px-2" style={{ minWidth: '960px', zoom: expandedZoom }}>
              <div className="grid gap-1 mb-1 text-xs text-white/60 text-center font-medium" style={{ gridTemplateColumns: 'repeat(7, 1fr) 120px' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <div key={i}>{d}</div>)}
                <div className="text-right pr-1">Week</div>
              </div>
              <div className="space-y-1">
                {(() => {
                  const weeks = [];
                  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
                  return weeks;
                })().map((week, wi) => {
                  let wkKm = 0, wkDone = 0, wkPart = 0, wkMiss = 0;
                  for (const d of week) {
                    if (!isSameMonth(new Date(d.date + 'T00:00'), currentDate)) continue;
                    const log = d.workout_log;
                    if (!log) continue;
                    if (log.distance_km) wkKm += log.distance_km;
                    const st = log.status || (log.completed ? 'completed' : 'missed');
                    if (st === 'completed') wkDone++;
                    else if (st === 'partial') wkPart++;
                    else wkMiss++;
                  }
                  return (
                  <div key={wi} className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, 1fr) 120px' }}>
                    {week.map(d => {
                      const dayDate = new Date(d.date + 'T00:00');
                      const inMonth = isSameMonth(dayDate, currentDate);
                      const status = d.workout_log ? (d.workout_log.status || (d.workout_log.completed ? 'completed' : 'missed')) : null;
                      // Days from the previous/next month are dimmed so the eye still
                      // anchors to the current month, but they remain visible & tappable.
                      const bg = !inMonth ? 'bg-white/5 border-white/10 hover:bg-white/10 opacity-60' :
                        status === 'completed' ? 'bg-green-500/40 border-green-400/50 hover:bg-green-500/50' :
                        status === 'partial' ? 'bg-yellow-500/35 border-yellow-400/45 hover:bg-yellow-500/45' :
                        status === 'missed' ? 'bg-red-500/35 border-red-400/45 hover:bg-red-500/45' :
                        'bg-white/20 border-white/30 hover:bg-white/30';
                      const cellHeight = 150;
                      const personalOverride = d.individual_target?.override_group;
                      const it = d.individual_target;
                      const workoutTitle = personalOverride
                        ? (it?.title || it?.note || 'Personal')
                        : (d.group_workout?.title || '');
                      const workoutBody = personalOverride
                        ? (it?.main_session || it?.warmup || (it?.title ? it?.note : '') || '')
                        : (d.group_workout?.content || d.group_workout?.main_session || '');
                      const hasPersonal = d.individual_target?.note || d.individual_target?.title;
                      const TYPE_FULL = {
                        simple:    { label: 'Other',     color: 'bg-gray-100 text-gray-700' },
                        easy:      { label: 'Easy run',  color: 'bg-emerald-100 text-emerald-700' },
                        rest:      { label: 'Rest day',  color: 'bg-slate-100 text-slate-700' },
                        tempo:     { label: 'Tempo',     color: 'bg-orange-100 text-orange-700' },
                        long:      { label: 'Long run',  color: 'bg-purple-100 text-purple-700' },
                        intervals: { label: 'Intervals', color: 'bg-red-100 text-red-700' },
                        fartlek:   { label: 'Fartlek',   color: 'bg-pink-100 text-pink-700' },
                        race:      { label: 'Race',      color: 'bg-indigo-100 text-indigo-700' },
                      };
                      const typeChip = personalOverride
                        ? (it?.workout_type ? TYPE_FULL[it.workout_type] : null)
                        : (d.group_workout?.workout_type ? TYPE_FULL[d.group_workout.workout_type] : null);
                      const cellIsRace = personalOverride
                        ? it?.workout_type === 'race'
                        : d.group_workout?.workout_type === 'race';
                      return (
                        <button
                          key={d.date}
                          onClick={() => { setMonthExpanded(false); openDay(d); }}
                          className={`rounded-lg ${cellIsRace ? 'border-2 border-indigo-500' : 'border'} ${bg} relative flex flex-col text-left transition overflow-hidden`}
                          style={{ minHeight: `${cellHeight}px` }}
                        >
                          <div className="flex items-start justify-between px-2 pt-1.5">
                            <span className="text-[11px] text-white/75 font-semibold leading-none">{format(dayDate, 'd')}</span>
                            {typeChip && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none ${typeChip.color}`}>
                                {typeChip.label}
                              </span>
                            )}
                          </div>

                          {/* Top half: planned workout */}
                          <div className="flex-1 px-2 py-1 min-h-0">
                            {workoutTitle && (
                              <p className={`text-xs font-semibold leading-tight line-clamp-2 ${personalOverride ? 'text-blue-200' : 'text-white'} [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]`}>
                                {cellIsRace && '🏁 '}{workoutTitle}
                              </p>
                            )}
                            {!workoutTitle && cellIsRace && (
                              <p className="text-xs font-semibold leading-tight text-indigo-200">🏁 Race</p>
                            )}
                            {workoutBody && (
                              <p className="text-[10px] text-white/65 leading-tight line-clamp-2 mt-0.5 whitespace-pre-wrap">{workoutBody}</p>
                            )}
                          </div>

                          {/* Divider */}
                          <div className="border-t border-dashed border-white/25 mx-1" />

                          {/* Bottom half: my report */}
                          <div className="flex-1 flex flex-col px-2 py-1 min-h-0">
                            {d.workout_log ? (
                              <>
                                {d.workout_log.notes ? (
                                  <p className="text-[10px] text-white/80 leading-tight line-clamp-2 whitespace-pre-wrap flex-1">{d.workout_log.notes}</p>
                                ) : !d.workout_log.distance_km ? (
                                  <p className="text-[10px] text-white/40 italic flex-1">No report</p>
                                ) : <div className="flex-1" />}
                                {d.workout_log.distance_km > 0 && (
                                  <p className="text-xs text-blue-200 font-bold leading-none mt-1 self-end">{d.workout_log.distance_km.toFixed(1)} km</p>
                                )}
                              </>
                            ) : (
                              <p className="text-[10px] text-white/40 italic">No report</p>
                            )}
                          </div>

                          {hasPersonal && !personalOverride && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" />}
                        </button>
                      );
                    })}
                    {/* Week stats column */}
                    <div className="flex flex-col items-end justify-center text-right px-1 text-xs">
                      <div className="font-bold text-blue-200">{wkKm > 0 ? `${wkKm.toFixed(1)}k` : '—'}</div>
                      <div className="flex gap-1.5 mt-1 text-[11px] font-mono">
                        <span className="text-green-300">V{wkDone}</span>
                        <span className="text-yellow-300">~{wkPart}</span>
                        <span className="text-red-300">X{wkMiss}</span>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Month totals */}
              {(() => {
                let mKm = 0, mDone = 0, mPart = 0, mMiss = 0;
                for (const d of days) {
                  if (!isSameMonth(new Date(d.date + 'T00:00'), currentDate)) continue;
                  const log = d.workout_log;
                  if (!log) continue;
                  if (log.distance_km) mKm += log.distance_km;
                  const st = log.status || (log.completed ? 'completed' : 'missed');
                  if (st === 'completed') mDone++;
                  else if (st === 'partial') mPart++;
                  else mMiss++;
                }
                return (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/15">
                    <span className="text-sm font-semibold text-white/85">{format(currentDate, 'MMMM')} totals</span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-bold text-blue-200">{mKm.toFixed(1)} km</span>
                      <div className="flex gap-2 text-xs font-mono">
                        <span className="text-green-300">V{mDone}</span>
                        <span className="text-yellow-300">~{mPart}</span>
                        <span className="text-red-300">X{mMiss}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </Modal>

      {selectedStravaActivity && (
        <StravaActivityDetail
          activityId={selectedStravaActivity.id}
          onClose={() => setSelectedStravaActivity(null)}
        />
      )}
    </div>
  );
}

function YearMonthLabel({ currentDate, onYearChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const currentYear = currentDate.getFullYear();
  const thisYear = new Date().getFullYear();
  // Show 8 years back, 4 years forward — covers history + future planning
  const years = Array.from({ length: 13 }, (_, i) => thisYear - 8 + i);

  return (
    <div className="relative" ref={ref}>
      <h2 className={className}>
        {format(currentDate, 'MMMM')}{' '}
        <button
          onClick={() => setOpen((v) => !v)}
          className="hover:underline focus:outline-none focus:underline transition"
          title="Switch year"
        >
          {format(currentDate, 'yyyy')}
        </button>
      </h2>
      {open && (
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-50 bg-blue-950 border border-white/20 rounded-lg shadow-2xl py-1 w-24 max-h-72 overflow-y-auto">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => { onYearChange(y); setOpen(false); }}
              className={`block w-full px-3 py-1.5 text-sm text-center transition ${
                y === currentYear
                  ? 'bg-blue-500 text-white font-semibold'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StravaActivityRow({ activity }) {
  const km = (activity.distance_m / 1000).toFixed(2);
  const mins = Math.floor(activity.moving_time_s / 60);
  const secs = String(activity.moving_time_s % 60).padStart(2, '0');
  return (
    <div className="flex items-center gap-2 text-xs bg-orange-400/15 border border-orange-400/25 rounded-lg px-2.5 py-1.5 mb-1.5">
      <span className="font-semibold text-orange-200 truncate flex-1">{activity.name}</span>
      <span className="bg-orange-400/20 text-orange-300 px-1.5 py-0.5 rounded font-medium shrink-0">{activity.type}</span>
      <span className="text-white/70 font-mono shrink-0">{km} km</span>
      <span className="text-white/50 font-mono shrink-0">{mins}:{secs}</span>
    </div>
  );
}
