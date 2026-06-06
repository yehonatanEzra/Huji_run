import { useState, useEffect } from 'react';
import {
  listTemplates, getTemplate, createTemplate, updateTemplate,
  deleteTemplate, applyTemplate,
} from '../../api/workoutTemplates';
import { listGroups } from '../../api/coach';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

const WORKOUT_TYPES = [
  { value: 'simple',    label: 'Other',     color: 'bg-gray-100 text-gray-700',       structured: false },
  { value: 'easy',      label: 'Easy run',  color: 'bg-emerald-100 text-emerald-700', structured: false },
  { value: 'rest',      label: 'Rest day',  color: 'bg-slate-100 text-slate-700',     structured: false },
  { value: 'tempo',     label: 'Tempo',     color: 'bg-orange-100 text-orange-700',   structured: true },
  { value: 'long',      label: 'Long run',  color: 'bg-purple-100 text-purple-700',   structured: true },
  { value: 'intervals', label: 'Intervals', color: 'bg-red-100 text-red-700',         structured: true },
  { value: 'fartlek',   label: 'Fartlek',   color: 'bg-pink-100 text-pink-700',       structured: true },
  { value: 'race',      label: 'Race',      color: 'bg-indigo-100 text-indigo-700',   structured: true, mainLabel: 'Race' },
];
const typeMeta = (t) => WORKOUT_TYPES.find((x) => x.value === t) || WORKOUT_TYPES[0];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const cellKey = (w, d) => `${w}-${d}`;

export default function WorkoutTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // template detail being edited, or 'new'
  const [applyTarget, setApplyTarget] = useState(null); // template summary to apply

  const refresh = () => {
    setLoading(true);
    listTemplates()
      .then(({ data }) => setTemplates(data))
      .catch((err) => setError(err.response?.data?.detail || 'Failed to load templates'))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const openNew = () => setEditing({ id: null, name: '', description: '', weeks_count: 4, days: [] });
  const openEdit = async (id) => {
    try {
      const { data } = await getTemplate(id);
      setEditing(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to open template');
    }
  };

  const handleDelete = async (t) => {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    try {
      await deleteTemplate(t.id);
      refresh();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete');
    }
  };

  if (editing) {
    return (
      <TemplateBuilder
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Workout Plans</h2>
        <button
          onClick={openNew}
          className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700"
        >
          + New plan
        </button>
      </div>

      {error && <p className="text-red-500 text-sm bg-red-50 rounded p-2">{error}</p>}
      {loading && <Spinner />}

      {!loading && templates.length === 0 && (
        <p className="text-gray-500 text-sm">No plans yet. Create one to reuse a multi-week block across groups.</p>
      )}

      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="bg-white border rounded-lg px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{t.name}</p>
                {t.description && <p className="text-xs text-gray-500 truncate">{t.description}</p>}
                <p className="text-xs text-gray-400 mt-0.5">
                  {t.weeks_count} week{t.weeks_count !== 1 ? 's' : ''} · {t.day_count} workout{t.day_count !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setApplyTarget(t)}
                  className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700"
                >
                  Apply
                </button>
                <button
                  onClick={() => openEdit(t.id)}
                  className="text-xs border border-gray-300 px-2.5 py-1 rounded hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className="text-xs text-red-500 px-1.5 py-1 rounded hover:bg-red-50"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {applyTarget && (
        <ApplyModal template={applyTarget} onClose={() => setApplyTarget(null)} />
      )}
    </div>
  );
}

// ── Builder ───────────────────────────────────────────────────────────────────

function TemplateBuilder({ initial, onClose, onSaved }) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description || '');
  const [weeks, setWeeks] = useState(initial.weeks_count);
  // day map: "week-dow" -> {workout_type, title, content, warmup, main_session, cooldown}
  const [dayMap, setDayMap] = useState(() => {
    const m = {};
    (initial.days || []).forEach((d) => {
      m[cellKey(d.week_number, d.day_of_week)] = {
        workout_type: d.workout_type, title: d.title || '', content: d.content || '',
        warmup: d.warmup || '', main_session: d.main_session || '', cooldown: d.cooldown || '',
      };
    });
    return m;
  });
  const [editCell, setEditCell] = useState(null); // {week, dow}
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setCell = (week, dow, value) => {
    setDayMap((prev) => {
      const next = { ...prev };
      if (value === null) delete next[cellKey(week, dow)];
      else next[cellKey(week, dow)] = value;
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    const days = Object.entries(dayMap)
      .map(([k, v]) => {
        const [w, d] = k.split('-').map(Number);
        return { week_number: w, day_of_week: d, ...v };
      })
      .filter((d) => d.week_number <= weeks);
    const body = { name: name.trim(), description: description.trim() || null, weeks_count: weeks, days };
    try {
      if (initial.id) await updateTemplate(initial.id, body);
      else await createTemplate(body);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">← Back</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save plan'}
        </button>
      </div>

      {error && <p className="text-red-500 text-sm bg-red-50 rounded p-2">{error}</p>}

      <input
        type="text"
        placeholder="Plan name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        type="text"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Weeks:</span>
        <button
          onClick={() => setWeeks((w) => Math.max(1, w - 1))}
          className="w-7 h-7 rounded border text-gray-600 hover:bg-gray-50"
        >−</button>
        <span className="text-sm font-medium w-6 text-center">{weeks}</span>
        <button
          onClick={() => setWeeks((w) => Math.min(26, w + 1))}
          className="w-7 h-7 rounded border text-gray-600 hover:bg-gray-50"
        >+</button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="p-1 text-left text-gray-400 font-normal w-10"></th>
              {DOW.map((d) => (
                <th key={d} className="p-1 text-gray-500 font-medium">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: weeks }, (_, wi) => wi + 1).map((week) => (
              <tr key={week}>
                <td className="p-1 text-gray-400 align-middle">W{week}</td>
                {DOW.map((_, dow) => {
                  const cell = dayMap[cellKey(week, dow)];
                  const meta = cell ? typeMeta(cell.workout_type) : null;
                  return (
                    <td key={dow} className="p-0.5">
                      <button
                        onClick={() => setEditCell({ week, dow })}
                        className={`w-full min-h-[44px] rounded border text-[10px] px-1 py-1 flex items-center justify-center text-center leading-tight transition-colors ${
                          cell ? meta.color + ' border-transparent' : 'bg-gray-50 border-dashed border-gray-200 text-gray-300 hover:border-gray-300'
                        }`}
                      >
                        {cell ? (cell.title || meta.label) : '+'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editCell && (
        <CellEditor
          week={editCell.week}
          dow={editCell.dow}
          value={dayMap[cellKey(editCell.week, editCell.dow)]}
          onClose={() => setEditCell(null)}
          onSave={(v) => { setCell(editCell.week, editCell.dow, v); setEditCell(null); }}
          onClear={() => { setCell(editCell.week, editCell.dow, null); setEditCell(null); }}
        />
      )}
    </div>
  );
}

function CellEditor({ week, dow, value, onClose, onSave, onClear }) {
  const [form, setForm] = useState(value || {
    workout_type: 'easy', title: '', content: '', warmup: '', main_session: '', cooldown: '',
  });
  const meta = typeMeta(form.workout_type);
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open onClose={onClose}>
      <h3 className="font-semibold mb-1">Week {week} · {DOW[dow]}</h3>
      <div className="space-y-3 mt-2">
        <div className="flex flex-wrap gap-1">
          {WORKOUT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => upd('workout_type', t.value)}
              className={`text-xs px-2 py-1 rounded-full border ${
                form.workout_type === t.value ? t.color + ' border-transparent font-medium' : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Title (optional)"
          value={form.title}
          onChange={(e) => upd('title', e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {meta.structured ? (
          <>
            <textarea
              placeholder="Warm-up"
              value={form.warmup}
              onChange={(e) => upd('warmup', e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder={meta.mainLabel || 'Main session'}
              value={form.main_session}
              onChange={(e) => upd('main_session', e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder="Cool-down"
              value={form.cooldown}
              onChange={(e) => upd('cooldown', e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </>
        ) : (
          <textarea
            placeholder="Details (optional)"
            value={form.content}
            onChange={(e) => upd('content', e.target.value)}
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onSave(form)}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700"
          >
            Set
          </button>
          {value && (
            <button
              onClick={onClear}
              className="px-4 border border-red-200 text-red-500 rounded-lg py-2 text-sm hover:bg-red-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Apply ─────────────────────────────────────────────────────────────────────

function ApplyModal({ template, onClose }) {
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listGroups().then(({ data }) => {
      setGroups(data);
      if (data.length) setGroupId(String(data[0].id));
    }).catch(() => {});
  }, []);

  const handleApply = async () => {
    if (!groupId || !startDate) return;
    setApplying(true);
    setError('');
    try {
      const { data } = await applyTemplate(template.id, {
        group_id: Number(groupId), start_date: startDate,
      });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal open onClose={onClose}>
      <h3 className="font-semibold mb-1">Apply "{template.name}"</h3>
      <p className="text-xs text-gray-500 mb-3">
        {template.weeks_count} weeks · {template.day_count} workouts. The start date snaps to its Monday.
      </p>

      {result ? (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
            Created {result.created} workouts from {result.start_monday} to {result.end_date}.
          </div>
          <button onClick={onClose} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <p className="text-red-500 text-sm bg-red-50 rounded p-2">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Group</label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start date (week 1, Monday)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleApply}
            disabled={applying || !groupId || !startDate}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {applying ? 'Applying…' : 'Apply to calendar'}
          </button>
        </div>
      )}
    </Modal>
  );
}
