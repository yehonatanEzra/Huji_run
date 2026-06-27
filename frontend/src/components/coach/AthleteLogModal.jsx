import { useState, useEffect, useCallback, useRef } from 'react';
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns';
import { getAthleteWeek } from '../../api/coach';
import { createTarget, updateTargetById, deleteTargetById, setGroupVisibility } from '../../api/calendar';
import { dayWorkouts, visibleDayWorkouts, visibleDayPlannedKm, tracksDistance } from '../../constants/workouts';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';

const TYPES = [
  { value: 'simple',    label: 'Other',     abbr: 'Oth',  color: 'bg-white/10 text-white/70',        structured: false },
  { value: 'easy',      label: 'Easy run',  abbr: 'Easy', color: 'bg-emerald-400/20 text-emerald-200', structured: false },
  { value: 'rest',      label: 'Rest day',  abbr: 'Rest', color: 'bg-slate-400/20 text-slate-200',     structured: false },
  { value: 'tempo',     label: 'Tempo',     abbr: 'Tmp',  color: 'bg-orange-400/20 text-orange-200',   structured: true },
  { value: 'long',      label: 'Long run',  abbr: 'Long', color: 'bg-purple-400/20 text-purple-200',   structured: true },
  { value: 'intervals', label: 'Intervals', abbr: 'Int',  color: 'bg-[#ec6a06]/25 text-[#ffb690]',     structured: true },
  { value: 'fartlek',   label: 'Fartlek',   abbr: 'Fart', color: 'bg-pink-400/20 text-pink-200',       structured: true },
  { value: 'race',      label: 'Race',      abbr: 'Race', color: 'bg-[#8083ff]/30 text-[#c0c1ff]',     structured: true, mainLabel: 'Race' },
  { value: 'strength',  label: 'Strength',  abbr: 'Str',  color: 'bg-amber-400/20 text-amber-200',     structured: false },
  { value: 'cycling',   label: 'Cycling',   abbr: 'Cyc',  color: 'bg-cyan-400/20 text-cyan-200',       structured: false },
];
const typeMetaFor = (t) => TYPES.find((x) => x.value === t) || TYPES[0];
const DEFAULT_TITLES = new Set(TYPES.map((t) => t.label));
// Planned km = the workouts the athlete actually sees (group unless hidden for the
// day + 'additional' personals).
const plannedKmOf = (day) => visibleDayPlannedKm(day);
const fmtKm = (n) => Number(n.toFixed(1)).toString();

const EMPTY = { workout_type: 'simple', title: '', content: '', note: '', warmup: '', main_session: '', cooldown: '', additional: false, distance_km: '', hidden: false };
const INPUT = 'w-full bg-[#1c1b1c]/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20';

export default function AthleteLogModal({ athlete, onClose }) {
  const [monthDate, setMonthDate] = useState(new Date());
  const [dayMap, setDayMap] = useState(null);  // { 'yyyy-MM-dd': dayData }
  const [editDay, setEditDay] = useState(null);
  // null = viewing the day's workout list; object = editing/creating one target.
  const [editingTarget, setEditingTarget] = useState(null);
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

  // Open a day → show its workout list.
  const openEdit = (day) => { setEditDay(day); setEditingTarget(null); };

  // Open the form to edit an existing target (t) or create a new one (t = null).
  const openTargetForm = (t) => {
    setForm({
      workout_type: t?.workout_type || 'simple',
      title: t?.title || '',
      content: t?.content || '',
      note: t?.note || '',
      warmup: t?.warmup || '',
      main_session: t?.main_session || '',
      cooldown: t?.cooldown || '',
      additional: t?.additional || false,
      distance_km: t?.distance_km ?? '',
      hidden: t?.hidden || false,
    });
    setEditingTarget(t || { __new: true });
  };

  const refetchInto = async (afterDate) => {
    await fetchMonth();
    const { data } = await getAthleteWeek(athlete.id, afterDate);
    const fresh = data.days.find((x) => x.date === afterDate);
    if (fresh) setEditDay(fresh);  // refresh the open day's list
  };

  const handleDeleteTarget = async (t) => {
    if (!t?.id) return;
    setSaving(true);
    try { await deleteTargetById(t.id); await refetchInto(editDay.date); }
    catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  // Day-level "don't show group workout today" toggle.
  const toggleGroupHide = async () => {
    if (!editDay) return;
    setSaving(true);
    try {
      await setGroupVisibility(athlete.id, editDay.date, !editDay.hide_group);
      await refetchInto(editDay.date);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const meta = typeMetaFor(form.workout_type);
  const hasAny = (meta.structured
    ? (form.warmup.trim() || form.main_session.trim() || form.cooldown.trim() || form.title.trim())
    : ((form.content || '').trim() || form.title.trim()))
    || (form.note || '').trim();
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // Picking a type auto-titles the workout with that type's name unless a custom
  // title was typed. 'Other' stays untitled.
  const selectType = (value) => setForm((f) => {
    const wasDefault = !f.title.trim() || DEFAULT_TITLES.has(f.title.trim());
    const nextTitle = wasDefault ? (value === 'simple' ? '' : typeMetaFor(value).label) : f.title;
    return { ...f, workout_type: value, title: nextTitle };
  });

  const handleSave = async (hiddenOverride) => {
    const hidden = typeof hiddenOverride === 'boolean' ? hiddenOverride : form.hidden;
    setSaving(true);
    try {
      if (hasAny) {
        const body = {
          note: form.note,
          additional: form.additional,
          workout_type: form.workout_type,
          title: form.title,
          content: meta.structured ? '' : (form.content || ''),
          warmup: meta.structured ? form.warmup : '',
          main_session: meta.structured ? form.main_session : '',
          cooldown: meta.structured ? form.cooldown : '',
          distance_km: !tracksDistance(form.workout_type) || form.distance_km === '' || form.distance_km == null ? null : parseFloat(form.distance_km),
          hidden,
        };
        if (editingTarget?.id) await updateTargetById(editingTarget.id, body);
        else await createTarget(athlete.id, editDay.date, body);
      } else if (editingTarget?.id) {
        await deleteTargetById(editingTarget.id);  // cleared an existing one
      }
      setEditingTarget(null);          // back to the day's list
      await refetchInto(editDay.date);
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
        {editDay && !editingTarget ? (
          // ── Day workout list ───────────────────────────────────────
          <div className="space-y-3">
            <button onClick={() => setEditDay(null)} className="text-xs text-white/50 hover:text-white">← Back to month</button>
            <h3 className="text-base font-bold text-white">
              {athlete.full_name} · {format(new Date(editDay.date + 'T00:00'), 'EEE, MMM d')}
            </h3>

            {editDay.group_workout && (
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Group workout this day{editDay.hide_group && <span className="text-white/35"> · hidden from athlete</span>}</p>
                <p className={`text-sm text-white/75 ${editDay.hide_group ? 'line-through opacity-50' : ''}`}>
                  {editDay.group_workout.title || typeMetaFor(editDay.group_workout.workout_type).label}
                  {editDay.group_workout.main_session ? ` · ${editDay.group_workout.main_session}` : editDay.group_workout.content ? ` · ${editDay.group_workout.content}` : ''}
                </p>
                <label className="flex items-start gap-2 cursor-pointer pt-1.5 border-t border-white/10">
                  <input type="checkbox" checked={!!editDay.hide_group} disabled={saving} onChange={toggleGroupHide} className="mt-0.5 w-4 h-4 rounded accent-[#c0c1ff]" />
                  <span className="text-xs text-white/60">Don’t show group workout today
                    <span className="block text-[11px] text-white/40">Hides it from the athlete this day and drops it from their planned km.</span>
                  </span>
                </label>
              </div>
            )}

            <p className="text-[10px] uppercase tracking-widest text-white/40">Personal workouts</p>
            {(editDay.targets || []).length === 0 && (
              <p className="text-sm text-white/45 italic">None yet — add one below.</p>
            )}
            <div className="space-y-2">
              {(editDay.targets || []).map((t) => {
                const tm = typeMetaFor(t.workout_type);
                return (
                  <div key={t.id} className={`rounded-xl border p-3 flex items-start justify-between gap-2 ${t.hidden ? 'border-dashed border-white/20 bg-white/[0.03]' : 'border-white/10 bg-white/[0.05]'}`}>
                    <button onClick={() => openTargetForm(t)} className="min-w-0 text-left flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${tm.color}`}>{tm.label}</span>
                        {t.hidden && <span className="text-[10px] text-white/40">🙈 hidden</span>}
                        {t.additional && <span className="text-[10px] text-[#c0c1ff]">+ with group</span>}
                      </div>
                      <p className="text-sm text-white mt-1 truncate">
                        {t.title || tm.label}
                        {t.distance_km > 0 && <span className="text-white/45 font-normal"> · {Number(t.distance_km).toFixed(1)} km</span>}
                      </p>
                    </button>
                    <button onClick={() => handleDeleteTarget(t)} disabled={saving}
                      className="shrink-0 text-[11px] px-2 py-1 rounded border border-red-400/30 text-red-300 hover:bg-red-500/15 disabled:opacity-50">Delete</button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => openTargetForm(null)}
              className="w-full border border-[#c0c1ff]/40 text-[#c0c1ff] rounded-xl py-2.5 text-sm font-bold hover:bg-[#c0c1ff]/10">
              + Add personal workout
            </button>
          </div>
        ) : editDay && editingTarget ? (
          // ── Edit / create one personal workout ─────────────────────
          <div className="space-y-3">
            <button onClick={() => setEditingTarget(null)} className="text-xs text-white/50 hover:text-white">← Back to day</button>
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
                <button key={t.value} onClick={() => selectType(t.value)}
                  className={`text-xs px-2 py-1.5 rounded-lg font-medium border transition ${
                    form.workout_type === t.value ? `${t.color} border-current` : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            <input type="text" value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="Title (shown on calendar)" className={INPUT} />

            {tracksDistance(form.workout_type) && (
              <input type="number" inputMode="decimal" value={form.distance_km} onChange={(e) => setField('distance_km', e.target.value)} placeholder="Distance (km)" className={INPUT} />
            )}

            {meta.structured ? (
              <>
                <textarea value={form.warmup} onChange={(e) => setField('warmup', e.target.value)} placeholder="Warm-up" rows={1} className={INPUT} />
                <textarea value={form.main_session} onChange={(e) => setField('main_session', e.target.value)} placeholder={meta.mainLabel || 'Main session'} rows={2} className={INPUT} />
                <textarea value={form.cooldown} onChange={(e) => setField('cooldown', e.target.value)} placeholder="Cool-down" rows={1} className={INPUT} />
              </>
            ) : (
              <textarea value={form.content} onChange={(e) => setField('content', e.target.value)} placeholder="Workout (what to do)…" rows={3} className={INPUT} />
            )}

            {/* Always-available note — shown to the athlete only when they open the day */}
            <textarea value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="Note for the athlete (optional)…" rows={2} className={INPUT} />

            {hasAny && (
              <>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={form.additional} onChange={(e) => setField('additional', e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-[#c0c1ff]" />
                  <span className="text-xs text-white/60">Show in addition to group workout
                    <span className="block text-[11px] text-white/40">Athlete sees this even when a group workout exists. If unchecked, a group workout that day replaces it.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={form.hidden} onChange={(e) => setField('hidden', e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-[#c0c1ff]" />
                  <span className="text-xs text-white/60">Hide from athlete
                    <span className="block text-[11px] text-white/40">They won’t see it until you share. You’ll still see it (gray) in this log.</span>
                  </span>
                </label>
              </>
            )}

            <button onClick={handleSave} disabled={saving}
              className="w-full bg-[#c0c1ff] text-[#1000a9] rounded-xl py-2.5 text-sm font-bold disabled:opacity-50">
              {saving ? 'Saving…' : hasAny ? (form.hidden ? 'Save (hidden)' : 'Save') : 'Clear'}
            </button>
            {hasAny && form.hidden && (
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="w-full border border-[#c0c1ff]/50 text-[#c0c1ff] rounded-xl py-2.5 text-sm font-bold hover:bg-[#c0c1ff]/10 disabled:opacity-50"
              >
                Share with athlete now
              </button>
            )}
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
                  className="w-full rounded-xl py-2.5 mb-4 flex items-center justify-center gap-2 text-sm font-medium text-white/90 border border-[#c0c1ff]/25 bg-[#c0c1ff]/5 hover:bg-[#c0c1ff]/10 active:scale-[0.98] transition"
                >⛶ Expand monthly view</button>

                <div className="space-y-4">
                  {weeks.map((week, wi) => {
                    const weekVolume = week.reduce((s, d) => s + (dayOf(d)?.log?.distance_km || 0), 0);
                    const expectedKm = week.reduce((s, d) => s + plannedKmOf(dayOf(d)), 0);
                    return (
                      <div key={wi}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-white/45 font-medium">{format(week[0], 'MMM d')} - {format(week[6], 'MMM d')}</p>
                          <div className="text-right">
                            <span className="text-sm font-bold text-white">{weekVolume > 0 ? weekVolume.toFixed(1) : '0'} km</span>
                            {expectedKm > 0 && <p className="text-[10px] text-white/75 font-normal">exp {fmtKm(expectedKm)} km</p>}
                          </div>
                        </div>
                        <div className="grid grid-cols-7 gap-2">
                          {week.map((d) => {
                            const key = format(d, 'yyyy-MM-dd');
                            const day = dayOf(d);
                            const inMonth = isSameMonth(d, monthDate);
                            const isToday = key === format(new Date(), 'yyyy-MM-dd');
                            const log = day?.log;
                            const logStatus = log?.status || (log?.completed ? 'completed' : (log?.missed ? 'missed' : null));
                            const wl = visibleDayWorkouts(day);
                            const _active = wl.find((w) => w.workout_type === 'race') || wl[0];
                            const activeType = _active?.workout_type;
                            const tm = activeType ? typeMetaFor(activeType) : null;
                            const isRace = activeType === 'race';
                            const extra = wl.length - 1;
                            // Hidden = the lead workout is a coach-only target the athlete can't see yet.
                            const hidden = _active?._source === 'personal' && !!_active?.hidden;
                            return (
                              <button
                                key={key}
                                onClick={() => day && openEdit(day)}
                                className={`flex flex-col items-center px-1 py-1.5 rounded-xl text-xs transition hover:shadow-sm relative ${
                                  !inMonth ? 'opacity-40' : ''
                                } ${hidden ? 'border border-dashed border-white/20 bg-white/[0.04]' :
                                   isRace ? 'border-2 border-[#8083ff]/45 bg-[#8083ff]/10' :
                                   isToday ? 'border border-[#c0c1ff]/40 bg-[#c0c1ff]/10' : 'border border-white/10 bg-white/10'}`}
                              >
                                {hidden && <span className="absolute top-0.5 right-0.5 text-[9px] leading-none" title="Hidden from athlete">🙈</span>}
                                {extra > 0 && <span className="absolute bottom-0.5 right-0.5 text-[7px] font-bold text-white/70 bg-white/15 rounded px-0.5 leading-none">+{extra}</span>}
                                {isRace && <span className="absolute top-0.5 left-0.5 text-[10px] leading-none">🏁</span>}
                                {tm && !isRace && <span className={`text-[8px] px-1 py-px rounded font-semibold leading-none ${tm.color}`}>{tm.abbr}</span>}
                                <span className="text-[10px] font-bold text-white">
                                  {log?.distance_km > 0 ? (log.distance_km < 10 ? log.distance_km.toFixed(1) : Math.round(log.distance_km)) : '-'}
                                </span>
                                <span className="font-semibold text-white">{format(d, 'd')}</span>
                                <span className="text-[10px] text-white/60">{format(d, 'EEE')}</span>
                                {logStatus && (
                                  <span className={`w-2 h-2 rounded-full mt-0.5 ${
                                    logStatus === 'completed' ? 'bg-green-400' : logStatus === 'partial' ? 'bg-yellow-400' : 'bg-red-400'
                                  }`} />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                <div className="space-y-2">
                  {weeks.map((week, wi) => {
                    const weekVolume = week.reduce((s, d) => s + (dayOf(d)?.log?.distance_km || 0), 0);
                    const expectedKm = week.reduce((s, d) => s + plannedKmOf(dayOf(d)), 0);
                    return (
                    <div key={wi}>
                      <div className="flex items-center justify-between px-1 mb-0.5">
                        <span className="text-[10px] text-white/40">{format(week[0], 'MMM d')} - {format(week[6], 'MMM d')}</span>
                        <span className="text-[10px] text-white">{weekVolume > 0 ? weekVolume.toFixed(1) : '0'} km{expectedKm > 0 ? ` · exp ${fmtKm(expectedKm)}` : ''}</span>
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                      {week.map((d) => {
                        const key = format(d, 'yyyy-MM-dd');
                        const day = dayOf(d);
                        const inMonth = isSameMonth(d, monthDate);
                        const wl = visibleDayWorkouts(day);
                        const active = wl.find((w) => w.workout_type === 'race') || wl[0];
                        const useTarget = active?._source === 'personal';
                        const tm = active ? typeMetaFor(active.workout_type) : null;
                        const log = day?.log;
                        const status = log?.status;
                        const hidden = useTarget && !!active.hidden;
                        const extra = wl.length - 1;
                        const title = active ? (active.title || active.content || active.main_session || active.warmup || typeMetaFor(active.workout_type).label) : '';
                        const bg = !inMonth ? 'bg-white/5 border-white/10 opacity-60' :
                          hidden ? 'bg-white/[0.04] border-dashed border-white/20' :
                          status === 'completed' ? 'bg-green-500/30 border-green-400/40' :
                          status === 'partial' ? 'bg-yellow-500/25 border-yellow-400/35' :
                          status === 'missed' ? 'bg-red-500/25 border-red-400/35' :
                          'bg-[#201f20]/50 border-white/15';
                        return (
                          <button key={key} onClick={() => day && (setExpanded(false), openEdit(day))}
                            className={`text-left rounded-lg border p-1.5 transition hover:brightness-125 flex flex-col ${bg} ${hidden ? 'text-white/50' : ''}`}
                            style={{ height: 130 }}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white">{format(d, 'd')}</span>
                              {tm && <span className={`text-[8px] font-bold uppercase px-1 rounded ${tm.color}`}>{useTarget ? '★' : ''}{tm.abbr}</span>}
                            </div>
                            {hidden && <p className="text-[8px] text-white/40 mt-0.5">🙈 hidden</p>}
                            {title && <p className="text-[10px] text-white/85 mt-1 line-clamp-3 leading-tight">{title}</p>}
                            {extra > 0 && <p className="text-[8px] text-[#c0c1ff] font-semibold mt-0.5">+{extra} more</p>}
                            {plannedKmOf(day) > 0 && <p className="text-[11px] text-white font-bold leading-none mt-auto self-end">{fmtKm(plannedKmOf(day))} km</p>}
                          </button>
                        );
                      })}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
