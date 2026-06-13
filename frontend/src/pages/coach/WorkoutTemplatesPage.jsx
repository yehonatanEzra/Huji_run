import { useState, useEffect } from 'react';
import {
  listTemplates, getTemplate, createTemplate, updateTemplate,
  deleteTemplate, applyTemplate,
} from '../../api/workoutTemplates';
import { listGroups } from '../../api/coach';
import { getCoachGroupWeek } from '../../api/calendar';
import { addDays, format } from 'date-fns';
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
      <div className="fixed inset-0 -z-10 bg-black" />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Workout Plans</h2>
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
        <p className="text-white/70 text-sm">No plans yet. Create one to reuse a multi-week block across groups.</p>
      )}

      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="bg-black/50 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate text-white">{t.name}</p>
                {t.description && <p className="text-xs text-white/50 truncate">{t.description}</p>}
                <p className="text-xs text-white/40 mt-0.5">
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
                  className="text-xs border border-white/20 text-white/80 px-2.5 py-1 rounded hover:bg-white/10"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className="text-xs text-red-600 border border-red-200 px-2.5 py-1 rounded hover:bg-red-50 flex items-center gap-1"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Delete
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
      <div className="fixed inset-0 -z-10 bg-black" />
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="text-sm text-blue-200 hover:text-white">← Back</button>
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

// Monday (week start) of a yyyy-MM-dd date string.
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00');
  return addDays(d, -((d.getDay() + 6) % 7));
}

function ApplyModal({ template, onClose }) {
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [step, setStep] = useState('form'); // form | confirm | diff | result
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [replaceCount, setReplaceCount] = useState(null); // existing workouts in the range

  const today = new Date().toISOString().slice(0, 10);
  const groupName = groups.find((g) => String(g.id) === String(groupId))?.name || '';

  useEffect(() => {
    listGroups().then(({ data }) => {
      setGroups(data);
      if (data.length) setGroupId(String(data[0].id));
    }).catch(() => {});
  }, []);

  // Count existing workouts across the plan's range when the confirm step opens.
  useEffect(() => {
    if (step !== 'confirm' || !groupId || !startDate) return;
    setReplaceCount(null);
    const sm = mondayOf(startDate);
    const rangeEnd = addDays(sm, template.weeks_count * 7);
    Promise.all(
      Array.from({ length: template.weeks_count + 1 }, (_, w) =>
        getCoachGroupWeek(Number(groupId), format(addDays(sm, w * 7), 'yyyy-MM-dd'))
      )
    ).then((res) => {
      let n = 0;
      res.forEach(({ data }) => data.days.forEach((day) => {
        const dt = new Date(day.date + 'T00:00');
        if (dt >= sm && dt < rangeEnd) n += (day.group_workouts || []).length;
      }));
      setReplaceCount(n);
    }).catch(() => setReplaceCount(0));
  }, [step, groupId, startDate]);

  const doApply = async () => {
    setApplying(true);
    setError('');
    try {
      const { data } = await applyTemplate(template.id, {
        group_id: Number(groupId), start_date: startDate, replace: true,
      });
      setResult(data);
      setStep('result');
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

      {step === 'result' ? (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
            Created {result.created} workouts from {result.start_monday} to {result.end_date}
            {result.replaced > 0 && `, replacing ${result.replaced} existing`}.
          </div>
          <button onClick={onClose} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">Done</button>
        </div>
      ) : step === 'diff' ? (
        <DiffCalendar
          templateId={template.id}
          weeksCount={template.weeks_count}
          groupId={Number(groupId)}
          startMonday={mondayOf(startDate)}
          onBack={() => setStep('confirm')}
          onApply={doApply}
          applying={applying}
        />
      ) : step === 'confirm' ? (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
            {replaceCount === null
              ? 'Checking existing workouts…'
              : replaceCount > 0
                ? <>This <strong>replaces {replaceCount} existing workout{replaceCount !== 1 ? 's' : ''}</strong> in {groupName ? `“${groupName}”` : 'the group'} across the plan's {template.weeks_count} week{template.weeks_count !== 1 ? 's' : ''} (from the Monday of {startDate}), then writes the plan. This can't be undone.</>
                : <>No existing workouts in {groupName ? `“${groupName}”` : 'the group'} over the plan's {template.weeks_count} week{template.weeks_count !== 1 ? 's' : ''} — the plan will be added cleanly.</>}
          </div>
          {error && <p className="text-red-500 text-sm bg-red-50 rounded p-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setStep('diff')} className="px-4 border border-blue-300 text-blue-700 rounded-lg py-2 text-sm font-medium hover:bg-blue-50">See diff</button>
            <button onClick={doApply} disabled={applying} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {applying ? 'Applying…' : 'Apply & override'}
            </button>
          </div>
          <button onClick={() => setStep('form')} className="w-full text-sm text-gray-500 hover:text-gray-700">Back</button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Group</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start date (week 1, Monday)</label>
            <input type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={() => { if (groupId && startDate) setStep('confirm'); }} disabled={!groupId || !startDate} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            Apply to calendar
          </button>
        </div>
      )}
    </Modal>
  );
}

// Now / After comparison for a plan apply. "After" = only the plan's workouts
// (the whole range is wiped first); changed days are flagged.
function DiffCalendar({ templateId, weeksCount, groupId, startMonday, onBack, onApply, applying }) {
  const [oldMap, setOldMap] = useState(null);
  const [newMap, setNewMap] = useState(null);
  const [view, setView] = useState('after'); // now | after

  useEffect(() => {
    let alive = true;
    // NEW: materialize the template days onto calendar dates.
    getTemplate(templateId).then(({ data }) => {
      if (!alive) return;
      const m = {};
      data.days.forEach((d) => {
        const dt = addDays(startMonday, (d.week_number - 1) * 7 + d.day_of_week);
        m[format(dt, 'yyyy-MM-dd')] = { workout_type: d.workout_type, title: d.title || typeMeta(d.workout_type).label };
      });
      setNewMap(m);
    }).catch(() => setNewMap({}));

    // OLD: current group workouts across the plan's weeks. getCoachGroupWeek
    // returns Sun–Sat weeks while the plan is Mon–Sun, so fetch one extra week
    // to cover the plan's trailing Sundays (extra dates are simply ignored).
    Promise.all(
      Array.from({ length: weeksCount + 1 }, (_, w) =>
        getCoachGroupWeek(groupId, format(addDays(startMonday, w * 7), 'yyyy-MM-dd'))
      )
    ).then((res) => {
      if (!alive) return;
      const m = {};
      res.forEach(({ data }) => data.days.forEach((day) => {
        const list = day.group_workouts || [];
        if (list.length) {
          const gw = list[list.length - 1]; // newest shown
          m[day.date] = { workout_type: gw.workout_type, title: gw.title || typeMeta(gw.workout_type).label };
        }
      }));
      setOldMap(m);
    }).catch(() => setOldMap({}));

    return () => { alive = false; };
  }, [templateId, weeksCount, groupId, startMonday]);

  if (!oldMap || !newMap) return <div className="py-8"><Spinner /></div>;

  const active = view === 'now' ? oldMap : newMap;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[['now', 'Now'], ['after', 'After applying']].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} className={`flex-1 py-1.5 rounded-md text-sm font-medium transition ${view === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] text-gray-400 text-center font-medium">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="space-y-1 max-h-[50vh] overflow-y-auto">
        {Array.from({ length: weeksCount }, (_, w) => (
          <div key={w} className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, i) => {
              const dt = addDays(startMonday, w * 7 + i);
              const key = format(dt, 'yyyy-MM-dd');
              const cell = active[key];
              const oldC = oldMap[key];
              const newC = newMap[key];
              const changed = (!!oldC !== !!newC) || (oldC && newC && (oldC.workout_type !== newC.workout_type || oldC.title !== newC.title));
              const tm = cell ? typeMeta(cell.workout_type) : null;
              return (
                <div key={key} className={`rounded-md border p-1 min-h-[3.2rem] ${changed ? 'border-amber-400 ring-1 ring-amber-300' : 'border-gray-200'} ${cell ? 'bg-white' : 'bg-gray-50'}`}>
                  <div className="text-[9px] text-gray-400">{format(dt, 'd')}</div>
                  {tm && <span className={`inline-block text-[8px] px-1 rounded ${tm.color} font-medium`}>{tm.label}</span>}
                  {cell?.title && <p className="text-[8px] text-gray-600 leading-tight line-clamp-2 mt-0.5">{cell.title}</p>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400">Amber-outlined days change. “After” shows only the plan’s workouts — everything else in these weeks is cleared.</p>

      <div className="flex gap-2">
        <button onClick={onBack} className="px-4 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50">Back</button>
        <button onClick={onApply} disabled={applying} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
          {applying ? 'Applying…' : 'Apply & override'}
        </button>
      </div>
    </div>
  );
}
