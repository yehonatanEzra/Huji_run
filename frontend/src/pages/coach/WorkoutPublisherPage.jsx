import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, subWeeks, addWeeks } from 'date-fns';
import { getWeek, upsertGroupWorkout, deleteGroupWorkout } from '../../api/calendar';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { Link } from 'react-router-dom';

export default function WorkoutPublisherPage() {
  const [weekDate, setWeekDate] = useState(new Date());
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [content, setContent] = useState('');
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
    setContent(day.group_workout?.content || '');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (content.trim()) {
        await upsertGroupWorkout(selectedDay.date, content);
      } else {
        await deleteGroupWorkout(selectedDay.date);
      }
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
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold flex-1">Coach Panel</h2>
        <Link to="/coach/targets" className="text-sm text-blue-600 hover:underline">Targets</Link>
        <Link to="/coach/dashboard" className="text-sm text-blue-600 hover:underline">Dashboard</Link>
        <Link to="/coach/race-wizard" className="text-sm text-blue-600 hover:underline">New Race</Link>
      </div>

      <h3 className="text-base font-semibold mb-3">Group Workouts</h3>

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekDate(subWeeks(weekDate, 1))} className="text-blue-600 text-sm font-medium">&larr; Prev</button>
        <span className="text-sm font-medium">
          {format(ws, 'MMM d')} - {format(addDays(ws, 6), 'MMM d, yyyy')}
        </span>
        <button onClick={() => setWeekDate(addWeeks(weekDate, 1))} className="text-blue-600 text-sm font-medium">Next &rarr;</button>
      </div>

      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {days.map((day) => (
            <button
              key={day.date}
              onClick={() => openDay(day)}
              className="w-full text-left p-3 rounded-xl border border-gray-200 bg-white hover:shadow-sm transition"
            >
              <span className="text-sm font-semibold">
                {format(new Date(day.date + 'T00:00'), 'EEE, MMM d')}
              </span>
              {day.group_workout ? (
                <p className="text-sm text-gray-600 mt-1 truncate">{day.group_workout.content}</p>
              ) : (
                <p className="text-sm text-gray-400 mt-1 italic">No workout set</p>
              )}
            </button>
          ))}
        </div>
      )}

      <Modal open={!!selectedDay} onClose={() => setSelectedDay(null)} title="Edit Group Workout">
        <div className="space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write the workout for the team..."
            rows={5}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : content.trim() ? 'Save Workout' : 'Clear Workout'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
