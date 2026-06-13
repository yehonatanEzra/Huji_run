import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
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
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('weekly');
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [monthExpanded, setMonthExpanded] = useState(false);
  // When a day is opened from the expanded month view, closing it should return
  // there rather than dropping back to the compact calendar.
  const [returnToExpanded, setReturnToExpanded] = useState(false);
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

  const openDay = (day, fromExpanded = false) => {
    setReturnToExpanded(fromExpanded);
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

  // Close the day detail; return to the expanded month view if we came from it.
  const closeDay = () => {
    setSelectedDay(null);
    if (returnToExpanded) { setMonthExpanded(true); setReturnToExpanded(false); }
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
      closeDay();
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

  // Dark-glass workout-type palette (matches the dark training-log design).
  const TYPE_GLASS = {
    simple:    { label: 'Other',     color: 'bg-white/10 text-white/70' },
    easy:      { label: 'Easy run',  color: 'bg-emerald-400/20 text-emerald-200' },
    rest:      { label: 'Rest day',  color: 'bg-slate-400/20 text-slate-200' },
    tempo:     { label: 'Tempo',     color: 'bg-orange-400/20 text-orange-200' },
    long:      { label: 'Long run',  color: 'bg-purple-400/20 text-purple-200' },
    intervals: { label: 'Intervals', color: 'bg-[#ec6a06]/25 text-[#ffb690]' },
    fartlek:   { label: 'Fartlek',   color: 'bg-pink-400/20 text-pink-200' },
    race:      { label: 'Race',      color: 'bg-[#8083ff]/30 text-[#c0c1ff]' },
  };
  // Short labels for the compact month-grid cells.
  const TYPE_ABBR_GLASS = {
    simple:    { abbr: 'Oth',  color: 'bg-white/10 text-white/70' },
    easy:      { abbr: 'Easy', color: 'bg-emerald-400/20 text-emerald-200' },
    rest:      { abbr: 'Rest', color: 'bg-slate-400/20 text-slate-200' },
    tempo:     { abbr: 'Tempo',color: 'bg-orange-400/20 text-orange-200' },
    long:      { abbr: 'Long', color: 'bg-purple-400/20 text-purple-200' },
    intervals: { abbr: 'Int',  color: 'bg-[#ec6a06]/25 text-[#ffb690]' },
    fartlek:   { abbr: 'Fart', color: 'bg-pink-400/20 text-pink-200' },
    race:      { abbr: 'Race', color: 'bg-[#8083ff]/30 text-[#c0c1ff]' },
  };

  const renderDayCard = (day) => {
    const date = new Date(day.date + 'T00:00');
    const isToday = day.date === format(new Date(), 'yyyy-MM-dd');
    const log = day.workout_log;
    const t = day.individual_target;
    const gw = day.group_workout;
    const personalOverride = t?.override_group;
    const activeType = personalOverride ? t?.workout_type : gw?.workout_type;
    const isRace = activeType === 'race';
    const typeMeta = activeType ? TYPE_GLASS[activeType] : null;

    // Workout text + optional coach note (personal override replaces the group workout).
    let snippet, note;
    if (personalOverride) {
      snippet = t.title || t.note;
      note = t.note && t.note !== snippet ? t.note : (t.main_session || t.warmup || null);
    } else {
      snippet = gw?.title || gw?.content || gw?.main_session || gw?.warmup;
      note = t && (t.title || t.note) ? `Coach note: ${t.title || t.note}` : null;
    }

    const km = log?.distance_km;
    const kudos = log?.kudos_count;

    return (
      <button
        key={day.date}
        onClick={() => openDay(day)}
        style={{ background: 'rgba(32,31,32,0.4)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        className={`w-full text-left rounded-2xl p-5 transition active:scale-[0.99] hover:border-[#c0c1ff]/40 border ${
          isRace ? 'border-[#8083ff]/45 bg-[#8083ff]/10' :
          isToday ? 'border-[#c0c1ff]/30' : 'border-white/10'
        } ${activeType === 'intervals' ? 'border-l-4 border-l-[#ec6a06]' : ''}`}
      >
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/50">
              {isRace && '🏁 '}{format(date, 'EEE, MMM d')}
            </p>
            {snippet ? (
              <p className="text-[17px] leading-snug text-[#e5e2e3] mt-0.5 truncate">{snippet}</p>
            ) : (
              <p className="text-[17px] italic text-white/35 mt-0.5">No workout scheduled</p>
            )}
            {note && <p className="text-xs text-white/55 mt-1 truncate">{note}</p>}
            {(km > 0 || kudos > 0) && (
              <div className="flex items-center gap-3 mt-2">
                {km > 0 && <span className="text-sm font-semibold text-[#c0c1ff]">{km.toFixed(1)} km</span>}
                {kudos > 0 && <span className="text-sm text-[#ffb690]">👏 {kudos}</span>}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {typeMeta && (
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${typeMeta.color}`}>{typeMeta.label}</span>
            )}
            {log && (
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                log.status === 'completed' ? 'bg-green-400/20 text-green-200' :
                log.status === 'partial'   ? 'bg-yellow-400/20 text-yellow-100' :
                                              'bg-red-400/20 text-red-200'
              }`}>
                {log.status === 'completed' ? 'Done' : log.status === 'partial' ? 'Partial' : 'Missed'}
              </span>
            )}
            {log?.manual_override && (
              <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500/80 text-white px-1.5 py-0.5 rounded" title="Manual — not overwritten by Strava">
                Manual
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const renderMonthGrid = () => {
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    const glass = { background: 'rgba(32,31,32,0.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' };
    const monthKm = days.reduce((s, d) =>
      new Date(d.date + 'T00:00').getMonth() === currentDate.getMonth()
        ? s + (d.workout_log?.distance_km || 0) : s, 0);
    return (
      <div>
        {/* Monthly volume card — compact, matches the weekly view */}
        <div className="flex items-center justify-between rounded-2xl px-5 py-3 mb-4 border border-white/10" style={glass}>
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#c0c1ff]">
            Monthly volume
          </span>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-[#c0c1ff]">
              {monthKm.toFixed(1)} <span className="text-sm font-medium text-white/50">km</span>
            </span>
            <Link
              to="/calendar/volume"
              aria-label="Open volume breakdown"
              className="w-8 h-8 rounded-full bg-[#c0c1ff]/10 border border-[#c0c1ff]/20 flex items-center justify-center hover:bg-[#c0c1ff]/20 active:scale-95 transition shrink-0"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#c0c1ff" strokeWidth={1.6} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Expand button */}
        <button
          onClick={() => setMonthExpanded(true)}
          style={glass}
          className="w-full rounded-xl py-4 mb-8 flex items-center justify-center gap-2 text-sm font-medium text-white/90 border border-[#c0c1ff]/20 hover:bg-[#c0c1ff]/5 active:scale-[0.98] transition"
        >
           Expand monthly view
        </button>

        <div className="space-y-6">
        {weeks.map((week, wi) => {
          const weekKm = week.reduce((s, d) => s + (d.workout_log?.distance_km || 0), 0);
          return (
          <div key={wi}>
            <div className="flex items-baseline justify-between mb-3 px-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/55">
                {format(new Date(week[0].date + 'T00:00'), 'MMM d')} - {format(new Date(week[6].date + 'T00:00'), 'MMM d')}
              </p>
              <span className="text-[10px] font-bold text-white">{weekKm.toFixed(1)} km</span>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {week.map((day) => {
                const dayDate = new Date(day.date + 'T00:00');
                const isToday = day.date === format(new Date(), 'yyyy-MM-dd');
                const hasLog = day.workout_log;
                const inMonth = dayDate.getMonth() === currentDate.getMonth();
                const activeType = day.individual_target?.override_group
                  ? day.individual_target?.workout_type
                  : day.group_workout?.workout_type;
                const isRace = activeType === 'race';
                const tag = activeType ? TYPE_ABBR_GLASS[activeType] : null;
                return (
                  <button
                    key={day.date}
                    onClick={() => openDay(day)}
                    style={glass}
                    className={`flex flex-col items-center justify-start py-1 px-1 rounded-xl relative transition active:scale-95 border ${
                      !inMonth ? 'opacity-40 border-white/10' :
                      isRace ? 'border-[#8083ff]/45 bg-[#8083ff]/10' :
                      isToday ? 'border-[#c0c1ff]/40 bg-[#c0c1ff]/10' : 'border-white/10'
                    }`}
                  >
                    {/* Workout-type tag at the top */}
                    <span className="h-3 flex items-center">
                      {tag && (
                        <span className={`text-[8px] font-bold uppercase px-1 py-px rounded leading-none ${tag.color}`}>
                          {isRace ? '🏁' : tag.abbr}
                        </span>
                      )}
                    </span>
                    {/* Km run this day — "-" when zero */}
                    <span className={`text-[10px] font-bold leading-none mt-0.5 ${hasLog?.distance_km ? 'text-[#c0c1ff]' : 'text-white/35'}`}>
                      {hasLog?.distance_km ? Number(hasLog.distance_km).toFixed(1) : '-'}
                    </span>
                    <span className={`text-xl font-semibold leading-none mt-0.5 ${isToday ? 'text-[#c0c1ff]' : 'text-white'}`}>
                      {format(dayDate, 'd')}
                    </span>
                    <span className="text-[10px] text-white/45 mt-0.5">{format(dayDate, 'EEE')}</span>
                    {/* One dot — the report status */}
                    <span className="h-1.5 mt-1 flex items-center">
                      {hasLog && (
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          hasLog.status === 'completed' ? 'bg-green-400' :
                          hasLog.status === 'partial' ? 'bg-yellow-400' : 'bg-red-400'
                        }`} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          );
        })}
        </div>
      </div>
    );
  };

  const glassBtn = 'w-10 h-10 flex items-center justify-center rounded-full bg-[#201f20]/40 backdrop-blur-xl border border-white/10 text-white/80 active:scale-95 transition';

  return (
    <div>
      {/* Track background + dark hero gradient (designer's training-log look) */}
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.45) 20%, rgba(19,19,20,0.50) 80%)' }} />

      {/* Date selector */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={goBack} className={glassBtn} aria-label="Previous">‹</button>
        {view === 'monthly' ? (
          <YearMonthLabel
            currentDate={currentDate}
            onYearChange={(y) => setCurrentDate(new Date(y, currentDate.getMonth(), 1))}
            className="text-lg font-semibold text-[#e5e2e3] tracking-tight text-center"
          />
        ) : (
          <h2 className="text-lg font-semibold text-[#e5e2e3] tracking-tight text-center">{headerLabel}</h2>
        )}
        <button onClick={goForward} className={glassBtn} aria-label="Next">›</button>
      </div>

      {/* Segmented control: Weekly / Monthly / My progress */}
      <div
        className="flex p-1 mb-6 rounded-full border border-white/5"
        style={{ background: 'rgba(28,27,28,0.5)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        <button
          onClick={() => setView('weekly')}
          className={`flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition ${view === 'weekly' ? 'bg-[#c0c1ff] text-[#1000a9] shadow-[0_0_15px_rgba(192,193,255,0.4)]' : 'text-white/60 hover:text-white'}`}
        >Weekly</button>
        <button
          onClick={() => setView('monthly')}
          className={`flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition ${view === 'monthly' ? 'bg-[#c0c1ff] text-[#1000a9] shadow-[0_0_15px_rgba(192,193,255,0.4)]' : 'text-white/60 hover:text-white'}`}
        >Monthly</button>
        <Link
          to="/progress"
          className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white/60 hover:text-white transition flex items-center justify-center text-center"
          title="See your trends, pace, and PBs"
        >My progress</Link>
      </div>


      {!loading && view === 'weekly' && (() => {
        const weekKm = days.reduce((s, d) => s + (d.workout_log?.distance_km || 0), 0);
        return (
          <div
            className="flex items-center justify-between rounded-2xl px-5 py-3 mb-4 border border-white/10"
            style={{ background: 'rgba(32,31,32,0.4)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
          >
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#c0c1ff]">
              Weekly volume
            </span>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-[#c0c1ff]">
                {weekKm.toFixed(1)} <span className="text-sm font-medium text-white/50">km</span>
              </span>
              <Link
                to="/calendar/volume"
                aria-label="Open volume breakdown"
                className="w-8 h-8 rounded-full bg-[#c0c1ff]/10 border border-[#c0c1ff]/20 flex items-center justify-center hover:bg-[#c0c1ff]/20 active:scale-95 transition shrink-0"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="#c0c1ff" strokeWidth={1.6} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </Link>
            </div>
          </div>
        );
      })()}

      {loading ? <Spinner /> : view === 'weekly' ? (
        <div className="space-y-3">
          {days.map(renderDayCard)}
        </div>
      ) : renderMonthGrid()}

      <Modal open={!!selectedDay} onClose={closeDay} title={selectedDay ? format(new Date(selectedDay.date + 'T00:00'), 'EEEE, MMM d') : ''} panelClassName="bg-[#131314] border-t border-white/10">
        {selectedDay && (
          <div className="space-y-4">
            {selectedDay.group_workout && (() => {
              const gw = selectedDay.group_workout;
              const TYPE_LABELS = { simple: 'Other', easy: 'Easy run', rest: 'Rest day', tempo: 'Tempo', long: 'Long run', intervals: 'Intervals', fartlek: 'Fartlek', race: 'Race' };
              const TYPE_COLOR = {
                simple: 'bg-white/10 text-white/70',
                easy: 'bg-emerald-400/20 text-emerald-200',
                rest: 'bg-slate-400/20 text-slate-200',
                tempo: 'bg-orange-400/20 text-orange-200',
                long: 'bg-purple-400/20 text-purple-200',
                intervals: 'bg-[#ec6a06]/25 text-[#ffb690]',
                fartlek: 'bg-pink-400/20 text-pink-200',
                race: 'bg-[#8083ff]/30 text-[#c0c1ff]',
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
                simple: 'bg-white/10 text-white/70',
                easy: 'bg-emerald-400/20 text-emerald-200',
                rest: 'bg-slate-400/20 text-slate-200',
                tempo: 'bg-orange-400/20 text-orange-200',
                long: 'bg-purple-400/20 text-purple-200',
                intervals: 'bg-[#ec6a06]/25 text-[#ffb690]',
                fartlek: 'bg-pink-400/20 text-pink-200',
                race: 'bg-[#8083ff]/30 text-[#c0c1ff]',
              };
              const isStructured = ['tempo', 'long', 'intervals', 'fartlek', 'race'].includes(t.workout_type);
              const middleLabel = t.workout_type === 'race' ? 'Race' : 'Main';
              const isRaceT = t.workout_type === 'race';
              return (
                <div className={`rounded-lg p-3 space-y-2 ${isRaceT ? 'bg-indigo-400/20 border-2 border-indigo-400/60' : 'bg-blue-400/15 backdrop-blur-sm border border-blue-300/25'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[#c0c1ff]">Coach's workout for you</p>
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
              {selectedDay.workout_log?.is_auto_marked && (
                <p className="text-[11px] text-white/60 italic mb-2 bg-white/5 border border-white/10 rounded-md px-2 py-1">
                  Auto-marked missed — tap a status to update it.
                </p>
              )}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { value: 'completed', label: 'Completed', text: 'text-green-400', border: 'border-green-500/40', glow: 'rgba(74,222,128,0.25)',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /> },
                  { value: 'partial', label: 'Half', text: 'text-yellow-400', border: 'border-yellow-500/40', glow: 'rgba(250,204,21,0.25)',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /> },
                  { value: 'missed', label: 'Missed', text: 'text-red-400', border: 'border-red-500/40', glow: 'rgba(248,113,113,0.25)',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /> },
                ].map((opt) => {
                  const active = logForm.status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setLogForm({ ...logForm, status: opt.value })}
                      style={{ background: 'rgba(32,31,32,0.4)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', ...(active ? { boxShadow: `0 0 20px ${opt.glow}` } : {}) }}
                      className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-3 border transition active:scale-95 ${active ? opt.border : 'border-white/10'}`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className={`w-6 h-6 ${opt.text}`}>{opt.icon}</svg>
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${opt.text}`}>{opt.label}</span>
                    </button>
                  );
                })}
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
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/45 mt-4 mb-2 block">Feedback</label>
              <textarea
                placeholder="How did it go? Any notes..."
                value={logForm.notes}
                onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
                rows={3}
                style={{ background: 'rgba(28,27,28,0.4)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
                className="w-full border border-white/10 rounded-2xl p-4 text-sm text-white placeholder-white/35 resize-none focus:outline-none focus:border-[#c0c1ff] focus:ring-4 focus:ring-[#c0c1ff]/10 transition"
              />
              <button
                onClick={handleSaveLog}
                disabled={saving}
                style={{ boxShadow: '0 0 20px rgba(192,193,255,0.3)' }}
                className="w-full mt-4 rounded-full bg-[#c0c1ff] text-[#1000a9] py-3 text-sm font-bold transition hover:scale-[1.01] active:scale-95 disabled:opacity-50"
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

            {selectedDay.workout_log?.id && (
              <WorkoutCommentThread workoutLogId={selectedDay.workout_log.id} />
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
        panelClassName="bg-[#131314]"
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
              className="text-[#c0c1ff] hover:text-white text-sm transition"
            >&larr; Prev</button>
            <YearMonthLabel
              currentDate={currentDate}
              onYearChange={(y) => setCurrentDate(new Date(y, currentDate.getMonth(), 1))}
              className="text-sm font-semibold text-white"
            />
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="text-[#c0c1ff] hover:text-white text-sm transition"
            >Next &rarr;</button>
          </div>

          <div
            ref={expandedScrollRef}
            className="overflow-x-auto -mx-2"
            style={{ touchAction: 'pan-x pan-y' }}
          >
            <div className="px-2" style={{ minWidth: '960px', zoom: expandedZoom }}>
              {/* Month totals (top) */}
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
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/15">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-white/85">{format(currentDate, 'MMMM')} totals</span>
                      <span className="font-bold text-[#c0c1ff]">{mKm.toFixed(1)} km</span>
                    </div>
                    <div className="flex gap-2 text-xs font-mono">
                      <span className="text-green-300">V{mDone}</span>
                      <span className="text-yellow-300">~{mPart}</span>
                      <span className="text-red-300">X{mMiss}</span>
                    </div>
                  </div>
                );
              })()}
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
                        simple:    { label: 'Other',     color: 'bg-white/10 text-white/70' },
                        easy:      { label: 'Easy run',  color: 'bg-emerald-400/20 text-emerald-200' },
                        rest:      { label: 'Rest day',  color: 'bg-slate-400/20 text-slate-200' },
                        tempo:     { label: 'Tempo',     color: 'bg-orange-400/20 text-orange-200' },
                        long:      { label: 'Long run',  color: 'bg-purple-400/20 text-purple-200' },
                        intervals: { label: 'Intervals', color: 'bg-[#ec6a06]/25 text-[#ffb690]' },
                        fartlek:   { label: 'Fartlek',   color: 'bg-pink-400/20 text-pink-200' },
                        race:      { label: 'Race',      color: 'bg-[#8083ff]/30 text-[#c0c1ff]' },
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
                          onClick={() => { setMonthExpanded(false); openDay(d, true); }}
                          className={`rounded-lg ${cellIsRace ? 'border-2 border-[#8083ff]' : 'border'} ${bg} relative flex flex-col text-left transition overflow-hidden`}
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
                              <p className={`text-xs font-semibold leading-tight line-clamp-2 ${personalOverride ? 'text-[#c0c1ff]' : 'text-white'} [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]`}>
                                {cellIsRace && '🏁 '}{workoutTitle}
                              </p>
                            )}
                            {!workoutTitle && cellIsRace && (
                              <p className="text-xs font-semibold leading-tight text-[#c0c1ff]">🏁 Race</p>
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
                                  <p className="text-xs text-[#c0c1ff] font-bold leading-none mt-1 self-end">{d.workout_log.distance_km.toFixed(1)} km</p>
                                )}
                              </>
                            ) : (
                              <p className="text-[10px] text-white/40 italic">No report</p>
                            )}
                          </div>

                          {hasPersonal && !personalOverride && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#c0c1ff]" />}
                        </button>
                      );
                    })}
                    {/* Week stats column */}
                    <div className="flex flex-col items-end justify-center text-right px-1 text-xs">
                      <div className="font-bold text-[#c0c1ff]">{wkKm > 0 ? `${wkKm.toFixed(1)}k` : '—'}</div>
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
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-50 bg-[#1c1b1c] border border-white/20 rounded-lg shadow-2xl py-1 w-24 max-h-72 overflow-y-auto">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => { onYearChange(y); setOpen(false); }}
              className={`block w-full px-3 py-1.5 text-sm text-center transition ${
                y === currentYear
                  ? 'bg-[#c0c1ff] text-[#1000a9] font-semibold'
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
