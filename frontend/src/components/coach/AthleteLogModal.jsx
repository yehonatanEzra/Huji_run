import { useState, useEffect, useCallback, useRef } from 'react';
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns';
import { getAthleteWeek } from '../../api/coach';
import { upsertTarget, deleteTarget } from '../../api/calendar';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';

const TYPES = [
  { value: 'simple',    label: 'Other',     abbr: 'Oth',  color: 'bg-white/10 text-white/70',        structured: false },
  { value: 'easy',      label: 'Easy run',  abbr: 'Easy', color: 'bg-emerald-400/20 text-emerald-200', structured: false },
  { value: 'rest',      label: 'Rest day',  abbr: 'Rest', color: 'bg-slate-400/20 text-slate-200',     structured: false },
  { value: 'tempo',     label: 'Tempo',     abbr: 'Tem',  color: 'bg-orange-400/20 text-orange-200',   structured: true },
  { value: 'long',      label: 'Long run',  abbr: 'Long', color: 'bg-purple-400/20 text-purple-200',   structured: true },
  { value: 'intervals', label: 'Intervals', abbr: 'Int',  color: 'bg-[#ec6a06]/25 text-[#ffb690]',     structured: true },
  { value: 'fartlek',   label: 'Fartlek',   abbr: 'Fart', color: 'bg-pink-400/20 text-pink-200',       structured: true },
  { value: 'race',      label: 'Race',      abbr: 'Race', color: 'bg-[#8083ff]/30 text-[#c0c1ff]',     structured: true, mainLabel: 'Race' },
];
const typeMetaFor = (t) => TYPES.find((x) => x.value === t) || TYPES[0];

const EMPTY = { workout_type: 'simple', title: '', note: '', warmup: '', main_session: '', cooldown: '', override_group: false };
const INPUT = 'w-full bg-[#1c1b1c]/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20';

export default function AthleteLogModal({ athlete, onClose }) {
  const [monthDate, setMonthDate] = useState(new Date());
  const [dayMap, setDayMap] = useState(null);  // { 'yyyy-MM-dd': dayData }
  const [editDay, setEditDay] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(0.75);
  const scrollRef = useRef(null);
  const pinchRef = useRef({ startDist: 0, startZoom: 1 });

  const calStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 });
  const calEnd = startOfWeek(endOfMonth(monthDate), { weekStartsOn: 0 });

  const fetchMonth = useCallback(() => {
    setDayMap(null);
    const weekStarts = [];
    let ws = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 });
    const end = startOfWeek(endOfMonth(monthDate), { weekStartsOn: 0 });
    while (ws <= end) { weekStarts.push(ws); ws = addDays(ws, 7); }
    Promise.all(weekStarts.map((d) => getAthleteWeek(athlete.id, format(d, 'yyyy-MM-dd'))))
      .then((res) => {
        const map = {};
        res.forEach(({ data }) => data.days.forEach((d) => { map[d.date] = d; }));
        setDayMap(map);
      })
      .catch(() => setDayMap({}));
  }, [athlete.id, monthDate]);
  useEffect(() => { fetchMonth(); }, [fetchMonth]);

  // Pinch-to-zoom (touch) + Ctrl/Cmd-scroll (desktop) inside the expanded grid.
  useEffect(() => {
    if (!expanded) return;
    const el = scrollRef.current;
    if (!el) return;
    const clamp = (v) => +Math.max(0.3, Math.min(1.8, v)).toFixed(2);
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clamp(z + (e.deltaY > 0 ? -0.05 : 0.05)));
    };
    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current.startDist = Math.hypot(dx, dy);
      setZoom((z) => { pinchRef.current.startZoom = z; return z; });
    };
    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || !pinchRef.current.startDist) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setZoom(clamp(pinchRef.current.startZoom * (Math.hypot(dx, dy) / pinchRef.current.startDist)));
    };
    const onTouchEnd = () => { pinchRef.current.startDist = 0; };
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
  }, [expanded]);

  const openEdit = (day) => {
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
    setEditDay(day);
  };

  const meta = typeMetaFor(form.workout_type);
  const hasAny = meta.structured
    ? (form.warmup.trim() || form.main_session.trim() || form.cooldown.trim() || form.title.trim())
    : (form.note.trim() || form.title.trim());
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (hasAny) {
        await upsertTarget(athlete.id, editDay.date, {
          note: form.note,
          override_group: form.override_group,
          workout_type: form.workout_type,
          title: form.title,
          warmup: meta.structured ? form.warmup : '',
          main_session: meta.structured ? form.main_session : '',
          cooldown: meta.structured ? form.cooldown : '',
        });
      } else {
        await deleteTarget(athlete.id, editDay.date);
      }
      setEditDay(null);
      fetchMonth();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  // Calendar weeks (rows of 7 dates) from calStart..calEnd.
  const weeks = [];
  { let cur = calStart; while (cur <= calEnd) { const r = []; for (let i = 0; i < 7; i++) { r.push(cur); cur = addDays(cur, 1); } weeks.push(r); } }

  const dayOf = (d) => dayMap?.[format(d, 'yyyy-MM-dd')];

  return (
    <>
      <Modal open onClose={onClose} panelClassName="bg-[#131314] border-t border-white/10">
        {editDay ? (
          // ── Edit screen ────────────────────────────────────────────
          <div className="space-y-3">
            <button onClick={() => setEditDay(null)} className="text-xs text-white/50 hover:text-white">← Back to month</button>
            <h3 className="text-base font-bold text-white">
              {athlete.full_name} · {format(new Date(editDay.date + 'T00:00'), 'EEE, MMM d')}
            </h3>

            {editDay.group_workout && (
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3">
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Group workout this day</p>
                <p className="text-sm text-white/75">
                  {editDay.group_workout.title || typeMetaFor(editDay.group_workout.workout_type).label}
                  {editDay.group_workout.main_session ? ` · ${editDay.group_workout.main_session}` : editDay.group_workout.content ? ` · ${editDay.group_workout.content}` : ''}
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5">
              {TYPES.map((t) => (
                <button key={t.value} onClick={() => setField('workout_type', t.value)}
                  className={`text-xs px-2 py-1.5 rounded-lg font-medium border transition ${
                    form.workout_type === t.value ? `${t.color} border-current` : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            <input type="text" value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="Title (shown on calendar)" className={INPUT} />

            {meta.structured ? (
              <>
                <textarea value={form.warmup} onChange={(e) => setField('warmup', e.target.value)} placeholder="Warm-up" rows={1} className={INPUT} />
                <textarea value={form.main_session} onChange={(e) => setField('main_session', e.target.value)} placeholder={meta.mainLabel || 'Main session'} rows={2} className={INPUT} />
                <textarea value={form.cooldown} onChange={(e) => setField('cooldown', e.target.value)} placeholder="Cool-down" rows={1} className={INPUT} />
              </>
            ) : (
              <textarea value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="Write a personal workout or note…" rows={4} className={INPUT} />
            )}

            {hasAny && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.override_group} onChange={(e) => setField('override_group', e.target.checked)} className="w-4 h-4 rounded accent-[#c0c1ff]" />
                <span className="text-xs text-white/60">Show this instead of the group workout</span>
              </label>
            )}

            <button onClick={handleSave} disabled={saving}
              className="w-full bg-[#c0c1ff] text-[#1000a9] rounded-xl py-2.5 text-sm font-bold disabled:opacity-50">
              {saving ? 'Saving…' : hasAny ? 'Save' : 'Clear'}
            </button>
          </div>
        ) : (
          // ── Month screen (compact) ─────────────────────────────────
          <div>
            <h3 className="text-base font-bold text-white mb-0.5">{athlete.full_name}</h3>
            <p className="text-xs text-white/45 mb-3">Tap a day to set a personal workout (override the group's).</p>

            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setMonthDate(subMonths(monthDate, 1))} className="text-[#c0c1ff] text-sm">‹ Prev</button>
              <span className="text-sm font-semibold text-white/90">{format(monthDate, 'MMMM yyyy')}</span>
              <button onClick={() => setMonthDate(addMonths(monthDate, 1))} className="text-[#c0c1ff] text-sm">Next ›</button>
            </div>

            {!dayMap ? <Spinner /> : (
              <>
                <button
                  onClick={() => setExpanded(true)}
                  className="w-full rounded-xl py-2.5 mb-3 flex items-center justify-center gap-2 text-sm font-medium text-white/90 border border-[#c0c1ff]/25 bg-[#c0c1ff]/5 hover:bg-[#c0c1ff]/10 active:scale-[0.98] transition"
                >⛶ Expand monthly view</button>

                <div className="grid grid-cols-7 gap-1 mb-1 text-[10px] text-white/40 text-center font-medium">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d}>{d}</div>)}
                </div>
                <div className="space-y-1">
                  {weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-1">
                      {week.map((d) => {
                        const key = format(d, 'yyyy-MM-dd');
                        const day = dayOf(d);
                        const inMonth = isSameMonth(d, monthDate);
                        const isToday = key === format(new Date(), 'yyyy-MM-dd');
                        const t = day?.target;
                        const tm = t ? typeMetaFor(t.workout_type) : null;
                        const gw = day?.group_workout;
                        const log = day?.log;
                        return (
                          <button
                            key={key}
                            onClick={() => day && openEdit(day)}
                            className={`flex flex-col items-center justify-start py-1 px-0.5 rounded-lg border min-h-[3.4rem] transition active:scale-95 ${
                              !inMonth ? 'opacity-35 border-white/5' :
                              isToday ? 'border-[#c0c1ff]/40 bg-[#c0c1ff]/10' : 'border-white/10 bg-[#201f20]/40 hover:bg-white/[0.06]'
                            }`}
                          >
                            <span className="h-3 flex items-center">
                              {tm && <span className={`text-[7px] font-bold uppercase px-1 rounded leading-none ${tm.color}`}>{t.override_group ? '★' : ''}{tm.abbr}</span>}
                            </span>
                            <span className={`text-sm font-semibold leading-none mt-0.5 ${isToday ? 'text-[#c0c1ff]' : 'text-white'}`}>{format(d, 'd')}</span>
                            <span className="h-1.5 mt-0.5 flex items-center gap-0.5">
                              {gw && !tm && <span className="w-1 h-1 rounded-full bg-white/30" />}
                              {log && <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'completed' ? 'bg-green-400' : log.status === 'partial' ? 'bg-yellow-400' : 'bg-red-400'}`} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-white/40 mt-3">★ = overrides the group workout · gray dot = group has a workout · colored dot = athlete's report</p>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Expanded month view — wide, zoomable */}
      <Modal open={expanded} onClose={() => setExpanded(false)} title={athlete.full_name} fullScreen panelClassName="bg-[#131314]">
        <div>
          <div className="flex items-center justify-end gap-2 mb-2">
            <span className="text-xs text-white/60">Zoom</span>
            <button onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.05).toFixed(2)))} disabled={zoom <= 0.3}
              className="w-7 h-7 rounded border border-white/20 bg-white/5 text-white text-sm font-bold hover:bg-white/15 disabled:opacity-30 transition">−</button>
            <span className="text-xs font-mono w-10 text-center text-white/85">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.05).toFixed(2)))} disabled={zoom >= 1.8}
              className="w-7 h-7 rounded border border-white/20 bg-white/5 text-white text-sm font-bold hover:bg-white/15 disabled:opacity-30 transition">+</button>
          </div>

          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setMonthDate(subMonths(monthDate, 1))} className="text-[#c0c1ff] hover:text-white text-sm transition">‹ Prev</button>
            <span className="text-sm font-semibold text-white">{format(monthDate, 'MMMM yyyy')}</span>
            <button onClick={() => setMonthDate(addMonths(monthDate, 1))} className="text-[#c0c1ff] hover:text-white text-sm transition">Next ›</button>
          </div>

          {!dayMap ? <Spinner /> : (
            <div ref={scrollRef} className="overflow-x-auto -mx-2" style={{ touchAction: 'pan-x pan-y' }}>
              <div className="px-2" style={{ minWidth: '900px', zoom }}>
                <div className="grid grid-cols-7 gap-1 mb-1 text-xs text-white/60 text-center font-medium">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d}>{d}</div>)}
                </div>
                <div className="space-y-1">
                  {weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-1">
                      {week.map((d) => {
                        const key = format(d, 'yyyy-MM-dd');
                        const day = dayOf(d);
                        const inMonth = isSameMonth(d, monthDate);
                        const t = day?.target;
                        const tm = t ? typeMetaFor(t.workout_type) : null;
                        const gw = day?.group_workout;
                        const log = day?.log;
                        const status = log?.status;
                        const title = t ? (t.title || t.note || t.main_session || t.warmup) : (gw ? (gw.title || typeMetaFor(gw.workout_type).label) : '');
                        const bg = !inMonth ? 'bg-white/5 border-white/10 opacity-60' :
                          status === 'completed' ? 'bg-green-500/30 border-green-400/40' :
                          status === 'partial' ? 'bg-yellow-500/25 border-yellow-400/35' :
                          status === 'missed' ? 'bg-red-500/25 border-red-400/35' :
                          'bg-[#201f20]/50 border-white/15';
                        return (
                          <button key={key} onClick={() => day && (setExpanded(false), openEdit(day))}
                            className={`text-left rounded-lg border p-1.5 transition hover:brightness-125 ${bg}`}
                            style={{ height: 130 }}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white">{format(d, 'd')}</span>
                              {tm && <span className={`text-[8px] font-bold uppercase px-1 rounded ${tm.color}`}>{t.override_group ? '★' : ''}{tm.abbr}</span>}
                            </div>
                            {title && <p className="text-[10px] text-white/85 mt-1 line-clamp-4 leading-tight">{title}</p>}
                            {!t && gw && <p className="text-[8px] text-white/40 mt-0.5">group</p>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
