import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, subWeeks, addWeeks } from 'date-fns';
import { getWeek, submitLog } from '../../api/calendar';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

export default function CalendarPage() {
  const [weekDate, setWeekDate] = useState(new Date());
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [logForm, setLogForm] = useState({ completed: false, notes: '' });
  const [saving, setSaving] = useState(false);

  const fetchWeek = async () => {
    setLoading(true);
    try {
      const { data } = await getWeek(format(weekDate, 'yyyy-MM-dd'));
      setDays(data.days);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWeek(); }, [weekDate]);

  const openDay = (day) => {
    setSelectedDay(day);
    setLogForm({
      completed: day.workout_log?.completed || false,
      notes: day.workout_log?.notes || '',
    });
  };

  const handleSaveLog = async () => {
    setSaving(true);
    try {
      await submitLog({ date: selectedDay.date, ...logForm });
      setSelectedDay(null);
      fetchWeek();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const ws = startOfWeek(weekDate, { weekStartsOn: 1 });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekDate(subWeeks(weekDate, 1))} className="text-blue-600 text-sm font-medium">&larr; Prev</button>
        <h2 className="text-base font-semibold">
          {format(ws, 'MMM d')} - {format(addDays(ws, 6), 'MMM d, yyyy')}
        </h2>
        <button onClick={() => setWeekDate(addWeeks(weekDate, 1))} className="text-blue-600 text-sm font-medium">Next &rarr;</button>
      </div>

      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {days.map((day) => {
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
                      hasLog.completed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {hasLog.completed ? 'Done' : 'Missed'}
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
          })}
        </div>
      )}

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
              <label className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={logForm.completed}
                  onChange={(e) => setLogForm({ ...logForm, completed: e.target.checked })}
                  className="w-5 h-5 rounded"
                />
                <span className="text-sm">Completed</span>
              </label>
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
