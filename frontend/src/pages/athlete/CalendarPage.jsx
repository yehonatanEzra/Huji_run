import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, subWeeks, addWeeks, subMonths, addMonths, isSameMonth } from 'date-fns';
import { getWeek, submitLog } from '../../api/calendar';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('weekly');
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [expandedZoom, setExpandedZoom] = useState(1);
  const [logForm, setLogForm] = useState({ status: 'missed', notes: '' });
  const [saving, setSaving] = useState(false);

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

  const openDay = (day) => {
    setSelectedDay(day);
    setLogForm({
      status: day.workout_log?.status || 'missed',
      distance_km: day.workout_log?.distance_km || '',
      notes: day.workout_log?.notes || '',
    });
  };

  const handleSaveLog = async () => {
    setSaving(true);
    try {
      const payload = { date: selectedDay.date, status: logForm.status, notes: logForm.notes };
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
    return (
      <button
        key={day.date}
        onClick={() => openDay(day)}
        className={`w-full text-left p-3 rounded-xl border transition ${
          isToday ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'
        } hover:shadow-sm`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold">
            {format(new Date(day.date + 'T00:00'), 'EEE, MMM d')}
          </span>
          <div className="flex items-center gap-1.5">
            {day.group_workout?.workout_type && (() => {
              const TYPE = {
                simple:    { label: 'Other',     color: 'bg-gray-100 text-gray-700' },
                easy:      { label: 'Easy run',  color: 'bg-emerald-100 text-emerald-700' },
                tempo:     { label: 'Tempo',     color: 'bg-orange-100 text-orange-700' },
                long:      { label: 'Long run',  color: 'bg-purple-100 text-purple-700' },
                intervals: { label: 'Intervals', color: 'bg-red-100 text-red-700' },
                fartlek:   { label: 'Fartlek',   color: 'bg-pink-100 text-pink-700' },
              };
              const t = TYPE[day.group_workout.workout_type];
              if (!t) return null;
              return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${t.color}`}>{t.label}</span>;
            })()}
            {hasLog?.kudos_count > 0 && (
              <span className="text-xs text-pink-600">👏 {hasLog.kudos_count}</span>
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
        {day.group_workout && (() => {
          const gw = day.group_workout;
          const snippet = gw.title || gw.content || gw.main_session || gw.warmup;
          if (!snippet) return null;
          return <p className="text-sm text-gray-700 font-medium truncate">{snippet}</p>;
        })()}
        {day.individual_target && (
          <p className="text-xs text-blue-600 mt-1">Coach note: {day.individual_target.note}</p>
        )}
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
        <div className="flex items-center justify-end mb-2">
          <button
            onClick={() => setMonthExpanded(true)}
            className="text-xs text-blue-600 hover:underline font-medium"
            title="Open larger view"
          >
            ⛶ Expand
          </button>
        </div>
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
                    tempo:     { abbr: 'Tem',  color: 'bg-orange-100 text-orange-700' },
                    long:      { abbr: 'Long', color: 'bg-purple-100 text-purple-700' },
                    intervals: { abbr: 'Int',  color: 'bg-red-100 text-red-700' },
                    fartlek:   { abbr: 'Fart', color: 'bg-pink-100 text-pink-700' },
                  };
                  const typeBadge = day.group_workout?.workout_type ? TYPE_ABBR[day.group_workout.workout_type] : null;
                  return (
                  <button
                    key={day.date}
                    onClick={() => openDay(day)}
                    className={`flex flex-col items-center p-1.5 rounded-lg border text-xs transition hover:shadow-sm relative ${
                      !inMonth ? 'opacity-40' : ''
                    } ${isToday ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
                  >
                    {typeBadge && (
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={goBack} className="text-blue-600 text-sm font-medium">&larr; Prev</button>
        <h2 className="text-base font-semibold">{headerLabel}</h2>
        <button onClick={goForward} className="text-blue-600 text-sm font-medium">Next &rarr;</button>
      </div>

      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
        <button
          onClick={() => setView('weekly')}
          className={`flex-1 py-1.5 text-sm font-medium transition ${view === 'weekly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
        >Weekly</button>
        <button
          onClick={() => setView('monthly')}
          className={`flex-1 py-1.5 text-sm font-medium transition ${view === 'monthly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
        >Monthly</button>
      </div>

      {!loading && (() => {
        const weekKm = days.reduce((s, d) => s + (d.workout_log?.distance_km || 0), 0);
        return weekKm > 0 ? (
          <div className="flex items-center justify-between bg-blue-50 rounded-lg px-4 py-2 mb-4">
            <span className="text-sm font-medium text-blue-700">
              {view === 'weekly' ? 'Weekly' : 'Monthly'} Volume
            </span>
            <span className="text-lg font-bold text-blue-800">{weekKm.toFixed(1)} km</span>
          </div>
        ) : null;
      })()}

      {loading ? <Spinner /> : view === 'weekly' ? (
        <div className="space-y-2">
          {days.map(renderDayCard)}
        </div>
      ) : renderMonthGrid()}

      <Modal open={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay ? format(new Date(selectedDay.date + 'T00:00'), 'EEEE, MMM d') : ''}>
        {selectedDay && (
          <div className="space-y-4">
            {selectedDay.group_workout && (() => {
              const gw = selectedDay.group_workout;
              const TYPE_LABELS = { simple: 'Other', easy: 'Easy run', tempo: 'Tempo', long: 'Long run', intervals: 'Intervals', fartlek: 'Fartlek' };
              const TYPE_COLOR = {
                simple: 'bg-gray-100 text-gray-700',
                easy: 'bg-emerald-100 text-emerald-700',
                tempo: 'bg-orange-100 text-orange-700',
                long: 'bg-purple-100 text-purple-700',
                intervals: 'bg-red-100 text-red-700',
                fartlek: 'bg-pink-100 text-pink-700',
              };
              const isStructured = ['tempo', 'long', 'intervals', 'fartlek'].includes(gw.workout_type);
              return (
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-gray-500">Group Workout</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[gw.workout_type] || TYPE_COLOR.simple}`}>
                      {TYPE_LABELS[gw.workout_type] || 'Simple'}
                    </span>
                  </div>
                  {gw.title && <p className="text-base font-semibold">{gw.title}</p>}
                  {isStructured ? (
                    <div className="space-y-1.5 text-sm">
                      {gw.warmup && <p><span className="text-xs uppercase tracking-wider text-gray-400">Warm-up · </span><span className="whitespace-pre-wrap">{gw.warmup}</span></p>}
                      {gw.main_session && <p><span className="text-xs uppercase tracking-wider text-gray-400">Main · </span><span className="whitespace-pre-wrap">{gw.main_session}</span></p>}
                      {gw.cooldown && <p><span className="text-xs uppercase tracking-wider text-gray-400">Cool-down · </span><span className="whitespace-pre-wrap">{gw.cooldown}</span></p>}
                    </div>
                  ) : (
                    gw.content && <p className="text-sm whitespace-pre-wrap">{gw.content}</p>
                  )}
                </div>
              );
            })()}
            {selectedDay.individual_target && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-500 mb-1">Coach's Note for You</p>
                <p className="text-sm">{selectedDay.individual_target.note}</p>
              </div>
            )}

            {selectedDay.workout_log && selectedDay.workout_log.kudos_count > 0 && (
              <div className="flex items-center gap-1.5 bg-pink-50 rounded-lg px-3 py-2">
                <span className="text-lg">👏</span>
                <span className="text-sm font-medium text-pink-700">
                  {selectedDay.workout_log.kudos_count} kudos
                </span>
              </div>
            )}

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Workout Report</p>
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
                  <label className="text-sm text-gray-600 whitespace-nowrap">Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g. 8.5"
                    value={logForm.distance_km}
                    onChange={(e) => setLogForm({ ...logForm, distance_km: e.target.value })}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <textarea
                placeholder="How did it go? Any notes..."
                value={logForm.notes}
                onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveLog}
                disabled={saving}
                className="w-full mt-3 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Report'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Expanded month view */}
      <Modal open={monthExpanded} onClose={() => setMonthExpanded(false)} title={format(currentDate, 'MMMM yyyy')}>
        <div>
          {/* Zoom controls */}
          <div className="flex items-center justify-end gap-2 mb-2">
            <span className="text-xs text-gray-500">Zoom</span>
            <button
              onClick={() => setExpandedZoom(z => Math.max(0.3, +(z - 0.05).toFixed(2)))}
              disabled={expandedZoom <= 0.3}
              className="w-7 h-7 rounded border border-gray-200 text-sm font-bold hover:bg-gray-50 disabled:opacity-30"
            >−</button>
            <span className="text-xs font-mono w-10 text-center">{Math.round(expandedZoom * 100)}%</span>
            <button
              onClick={() => setExpandedZoom(z => Math.min(1.8, +(z + 0.05).toFixed(2)))}
              disabled={expandedZoom >= 1.8}
              className="w-7 h-7 rounded border border-gray-200 text-sm font-bold hover:bg-gray-50 disabled:opacity-30"
            >+</button>
            <button onClick={() => setExpandedZoom(1)} className="text-xs text-blue-600 hover:underline ml-1">Reset</button>
          </div>

          <div className="overflow-x-auto -mx-2">
            <div className="px-2" style={{ minWidth: `${Math.round(960 * expandedZoom)}px` }}>
              <div className="grid gap-1 mb-1 text-xs text-gray-500 text-center font-medium" style={{ gridTemplateColumns: 'repeat(7, 1fr) 120px' }}>
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
                      const bg = !inMonth ? 'bg-transparent border-transparent' :
                        status === 'completed' ? 'bg-green-50 border-green-300 hover:bg-green-100' :
                        status === 'partial' ? 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100' :
                        status === 'missed' ? 'bg-red-50 border-red-300 hover:bg-red-100' :
                        'bg-white border-gray-200 hover:bg-gray-50';
                      const cellHeight = Math.round(150 * expandedZoom);
                      if (!inMonth) return <div key={d.date} style={{ minHeight: `${cellHeight}px` }} />;
                      const personalOverride = d.individual_target?.override_group;
                      const workoutTitle = personalOverride
                        ? (d.individual_target?.note || 'Personal')
                        : (d.group_workout?.title || '');
                      const workoutBody = personalOverride
                        ? null
                        : (d.group_workout?.content || d.group_workout?.main_session || '');
                      const hasPersonal = d.individual_target?.note;
                      const TYPE_FULL = {
                        simple:    { label: 'Other',     color: 'bg-gray-100 text-gray-700' },
                        easy:      { label: 'Easy run',  color: 'bg-emerald-100 text-emerald-700' },
                        tempo:     { label: 'Tempo',     color: 'bg-orange-100 text-orange-700' },
                        long:      { label: 'Long run',  color: 'bg-purple-100 text-purple-700' },
                        intervals: { label: 'Intervals', color: 'bg-red-100 text-red-700' },
                        fartlek:   { label: 'Fartlek',   color: 'bg-pink-100 text-pink-700' },
                      };
                      const typeChip = !personalOverride && d.group_workout?.workout_type ? TYPE_FULL[d.group_workout.workout_type] : null;
                      return (
                        <button
                          key={d.date}
                          onClick={() => { setMonthExpanded(false); openDay(d); }}
                          className={`rounded-lg border ${bg} relative flex flex-col text-left transition overflow-hidden`}
                          style={{ minHeight: `${cellHeight}px` }}
                        >
                          <div className="flex items-start justify-between px-2 pt-1.5">
                            <span className="text-[11px] text-gray-500 leading-none">{format(dayDate, 'd')}</span>
                            {typeChip && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none ${typeChip.color}`}>
                                {typeChip.label}
                              </span>
                            )}
                          </div>

                          {/* Top half: planned workout */}
                          <div className="flex-1 px-2 py-1 min-h-0">
                            {workoutTitle && (
                              <p className={`text-xs font-semibold leading-tight line-clamp-2 ${personalOverride ? 'text-blue-700' : 'text-gray-800'}`}>
                                {workoutTitle}
                              </p>
                            )}
                            {workoutBody && (
                              <p className="text-[10px] text-gray-500 leading-tight line-clamp-2 mt-0.5 whitespace-pre-wrap">{workoutBody}</p>
                            )}
                          </div>

                          {/* Divider */}
                          <div className="border-t border-dashed border-gray-300/70 mx-1" />

                          {/* Bottom half: my report */}
                          <div className="flex-1 px-2 py-1 min-h-0">
                            {d.workout_log ? (
                              <>
                                {d.workout_log.notes && (
                                  <p className="text-[10px] text-gray-700 leading-tight line-clamp-2 whitespace-pre-wrap">{d.workout_log.notes}</p>
                                )}
                                {d.workout_log.distance_km > 0 && (
                                  <p className="text-xs text-blue-700 font-bold mt-0.5">{d.workout_log.distance_km.toFixed(1)}k</p>
                                )}
                              </>
                            ) : (
                              <p className="text-[10px] text-gray-300 italic">No report</p>
                            )}
                          </div>

                          {hasPersonal && !personalOverride && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" />}
                        </button>
                      );
                    })}
                    {/* Week stats column */}
                    <div className="flex flex-col items-end justify-center text-right px-1 text-xs">
                      <div className="font-bold text-blue-700">{wkKm > 0 ? `${wkKm.toFixed(1)}k` : '—'}</div>
                      <div className="flex gap-1.5 mt-1 text-[11px] font-mono">
                        <span className="text-green-700">V{wkDone}</span>
                        <span className="text-yellow-700">~{wkPart}</span>
                        <span className="text-red-700">X{wkMiss}</span>
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
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                    <span className="text-sm font-semibold text-gray-700">{format(currentDate, 'MMMM')} totals</span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-bold text-blue-700">{mKm.toFixed(1)} km</span>
                      <div className="flex gap-2 text-xs font-mono">
                        <span className="text-green-700">V{mDone}</span>
                        <span className="text-yellow-700">~{mPart}</span>
                        <span className="text-red-700">X{mMiss}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between mt-3">
                <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="text-blue-600 text-sm">&larr; Prev</button>
                <span className="text-sm font-medium">{format(currentDate, 'MMMM yyyy')}</span>
                <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="text-blue-600 text-sm">Next &rarr;</button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
