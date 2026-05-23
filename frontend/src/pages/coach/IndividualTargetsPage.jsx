import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, subWeeks, addWeeks } from 'date-fns';
import { listAthletes } from '../../api/coach';
import { getWeek, upsertTarget, deleteTarget } from '../../api/calendar';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

export default function IndividualTargetsPage() {
  const [athletes, setAthletes] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [weekDate, setWeekDate] = useState(new Date());
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editDay, setEditDay] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listAthletes().then(({ data }) => {
      setAthletes(data);
      if (data.length > 0) setSelectedAthlete(data[0]);
    });
  }, []);

  const fetchWeek = async () => {
    if (!selectedAthlete) return;
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

  useEffect(() => { fetchWeek(); }, [selectedAthlete, weekDate]);

  const openEdit = (day) => {
    setEditDay(day);
    setNote(day.individual_target?.note || '');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (note.trim()) {
        await upsertTarget(selectedAthlete.id, editDay.date, note);
      } else {
        await deleteTarget(selectedAthlete.id, editDay.date);
      }
      setEditDay(null);
      fetchWeek();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const ws = startOfWeek(weekDate, { weekStartsOn: 0 });

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Individual Targets</h2>

      <select
        value={selectedAthlete?.id || ''}
        onChange={(e) => setSelectedAthlete(athletes.find((a) => a.id === parseInt(e.target.value)))}
        className="w-full border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {athletes.map((a) => (
          <option key={a.id} value={a.id}>{a.full_name}</option>
        ))}
      </select>

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekDate(subWeeks(weekDate, 1))} className="text-blue-600 text-sm">&larr; Prev</button>
        <span className="text-sm font-medium">
          {format(ws, 'MMM d')} - {format(addDays(ws, 6), 'MMM d, yyyy')}
        </span>
        <button onClick={() => setWeekDate(addWeeks(weekDate, 1))} className="text-blue-600 text-sm">Next &rarr;</button>
      </div>

      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {days.map((day) => (
            <button
              key={day.date}
              onClick={() => openEdit(day)}
              className="w-full text-left p-3 rounded-xl border border-gray-200 bg-white hover:shadow-sm transition"
            >
              <span className="text-sm font-semibold">{format(new Date(day.date + 'T00:00'), 'EEE, MMM d')}</span>
              {day.individual_target ? (
                <p className="text-sm text-blue-600 mt-1">{day.individual_target.note}</p>
              ) : (
                <p className="text-sm text-gray-400 mt-1 italic">No target set</p>
              )}
            </button>
          ))}
        </div>
      )}

      <Modal open={!!editDay} onClose={() => setEditDay(null)} title={`Note for ${selectedAthlete?.full_name}`}>
        <div className="space-y-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Write a personal target or note..."
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : note.trim() ? 'Save Note' : 'Clear Note'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
