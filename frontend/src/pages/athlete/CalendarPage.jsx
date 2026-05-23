import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, subWeeks, addWeeks, subMonths, addMonths } from 'date-fns';
import { getWeek, submitLog } from '../../api/calendar';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('weekly');
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
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
        {day.group_workout && (
          <p className="text-sm text-gray-600 truncate">{day.group_workout.content}</p>
        )}
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
                return (
                  <button
                    key={day.date}
                    onClick={() => openDay(day)}
                    className={`flex flex-col items-center p-1.5 rounded-lg border text-xs transition hover:shadow-sm ${
                      !inMonth ? 'opacity-40' : ''
                    } ${isToday ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
                  >
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
            {selectedDay.group_workout && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Group Workout</p>
                <p className="text-sm whitespace-pre-wrap">{selectedDay.group_workout.content}</p>
              </div>
            )}
            {selectedDay.individual_target && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-500 mb-1">Coach's Note for You</p>
                <p className="text-sm">{selectedDay.individual_target.note}</p>
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
    </div>
  );
}
