import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, subWeeks, addWeeks } from 'date-fns';
import { listAthletes, getAthleteWeek } from '../../api/coach';
import { upsertTarget, deleteTarget } from '../../api/calendar';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

const WORKOUT_TYPES = [
  { value: 'simple',    label: 'Other',     color: 'bg-gray-100 text-gray-700',       structured: false },
  { value: 'easy',      label: 'Easy run',  color: 'bg-emerald-100 text-emerald-700', structured: false },
  { value: 'tempo',     label: 'Tempo',     color: 'bg-orange-100 text-orange-700',   structured: true },
  { value: 'long',      label: 'Long run',  color: 'bg-purple-100 text-purple-700',   structured: true },
  { value: 'intervals', label: 'Intervals', color: 'bg-red-100 text-red-700',         structured: true },
  { value: 'fartlek',   label: 'Fartlek',   color: 'bg-pink-100 text-pink-700',       structured: true },
];
const typeMetaFor = (t) => WORKOUT_TYPES.find(x => x.value === t) || WORKOUT_TYPES[0];

export default function IndividualTargetsPage() {
  const [athletes, setAthletes] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [weekDate, setWeekDate] = useState(new Date());
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editDay, setEditDay] = useState(null);
  const [form, setForm] = useState({
    workout_type: 'simple', title: '', note: '',
    warmup: '', main_session: '', cooldown: '', override_group: false,
  });
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
      const { data } = await getAthleteWeek(selectedAthlete.id, format(weekDate, 'yyyy-MM-dd'));
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
    const t = day.target;
    setForm({
      workout_type: t?.workout_type || 'simple',
      title: t?.title || '',
      note: t?.note || '',
      warmup: t?.warmup || '',
      main_session: t?.main_session || '',
      cooldown: t?.cooldown || '',
      override_group: t?.override_group || false,
    });
  };

  const meta = typeMetaFor(form.workout_type);
  const hasAny = meta.structured
    ? (form.warmup.trim() || form.main_session.trim() || form.cooldown.trim() || form.title.trim())
    : (form.note.trim() || form.title.trim());

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (hasAny) {
        await upsertTarget(selectedAthlete.id, editDay.date, {
          note: form.note,
          override_group: form.override_group,
          workout_type: form.workout_type,
          title: form.title,
          warmup: meta.structured ? form.warmup : '',
          main_session: meta.structured ? form.main_session : '',
          cooldown: meta.structured ? form.cooldown : '',
        });
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
          {days.map((day) => {
            const t = day.target;
            const meta = t ? typeMetaFor(t.workout_type) : null;
            const snippet = t ? (t.title || t.note || t.main_session || t.warmup) : null;
            return (
              <button
                key={day.date}
                onClick={() => openEdit(day)}
                className="w-full text-left p-3 rounded-xl border border-gray-200 bg-white hover:shadow-sm transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{format(new Date(day.date + 'T00:00'), 'EEE, MMM d')}</span>
                  {meta && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.color}`}>{meta.label}</span>
                  )}
                </div>
                {snippet ? (
                  <p className="text-sm text-blue-600 mt-1 truncate">{snippet}</p>
                ) : (
                  <p className="text-sm text-gray-400 mt-1 italic">No target set</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      <Modal open={!!editDay} onClose={() => setEditDay(null)} title={`Personal workout for ${selectedAthlete?.full_name}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {WORKOUT_TYPES.map(t => (
              <button key={t.value} onClick={() => setField('workout_type', t.value)}
                className={`text-xs px-2 py-1.5 rounded-lg font-medium border transition ${
                  form.workout_type === t.value ? `${t.color} border-current` : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <input type="text" value={form.title} onChange={(e) => setField('title', e.target.value)}
            placeholder="Title (shown on calendar)"
            className="w-full border rounded-lg px-3 py-2 text-sm" />

          {meta.structured ? (
            <>
              <textarea value={form.warmup} onChange={(e) => setField('warmup', e.target.value)}
                placeholder="Warm-up" rows={1}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
              <textarea value={form.main_session} onChange={(e) => setField('main_session', e.target.value)}
                placeholder="Main session" rows={2}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
              <textarea value={form.cooldown} onChange={(e) => setField('cooldown', e.target.value)}
                placeholder="Cool-down" rows={1}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </>
          ) : (
            <textarea value={form.note} onChange={(e) => setField('note', e.target.value)}
              placeholder="Write a personal target or note..."
              rows={4}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          )}

          {hasAny && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.override_group} onChange={(e) => setField('override_group', e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-xs text-gray-600">Show this instead of group workout</span>
            </label>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : hasAny ? 'Save' : 'Clear'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
