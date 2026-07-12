import { useState, useEffect, useRef } from 'react';
import {
  getTemplate, createTemplate, updateTemplate,
  applyTemplate, applyTemplateToAthlete,
} from '../../api/workoutTemplates';
import { listGroups, listAthletes } from '../../api/coach';
import { getCoachGroupWeek } from '../../api/calendar';
import { addDays, format } from 'date-fns';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { tracksDistance } from '../../constants/workouts';

export const WORKOUT_TYPES = [
  { value: 'simple',    label: 'Other',     color: 'bg-gray-100 text-gray-700',       structured: false },
  { value: 'easy',      label: 'Easy run',  color: 'bg-emerald-100 text-emerald-700', structured: false },
  { value: 'rest',      label: 'Rest day',  color: 'bg-slate-100 text-slate-700',     structured: false },
  { value: 'tempo',     label: 'Tempo',     color: 'bg-orange-100 text-orange-700',   structured: true },
  { value: 'long',      label: 'Long run',  color: 'bg-purple-100 text-purple-700',   structured: true },
  { value: 'intervals', label: 'Intervals', color: 'bg-red-100 text-red-700',         structured: true },
  { value: 'fartlek',   label: 'Fartlek',   color: 'bg-pink-100 text-pink-700',       structured: true },
  { value: 'race',      label: 'Race',      color: 'bg-indigo-100 text-indigo-700',   structured: true, mainLabel: 'Race' },
  { value: 'strength',  label: 'Strength',  color: 'bg-amber-100 text-amber-700',     structured: false },
  { value: 'cycling',   label: 'Cycling',   color: 'bg-cyan-100 text-cyan-700',       structured: false },
];
export const typeMeta = (t) => WORKOUT_TYPES.find((x) => x.value === t) || WORKOUT_TYPES[0];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Backend keeps day_of_week 0=Mon..6=Sun; this is just the column display order
// (Sunday first) — the stored day_of_week value is unchanged.
const DOW_ORDER = [6, 0, 1, 2, 3, 4, 5];
const cellKey = (w, d) => `${w}-${d}`;
// Sum the planned distance across a cell's list of workouts.
const cellKm = (list) => (list || []).reduce((s, w) => s + (parseFloat(w.distance_km) || 0), 0);
const EMPTY_DAY = { workout_type: 'easy', title: '', content: '', warmup: '', main_session: '', cooldown: '', distance_km: '' };

// Builder styling (glass panels + vivid grid cells)
const PANEL = 'bg-slate-800/60 backdrop-blur-xl border border-white/5';
const BUILDER_INPUT = 'w-full bg-slate-900/40 border border-slate-600/40 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors';
const CELL_COLOR = {
  simple: 'bg-slate-500/85', easy: 'bg-emerald-500/85', rest: 'bg-slate-400/80',
  tempo: 'bg-orange-500/85', long: 'bg-purple-500/85', intervals: 'bg-red-500/85',
  fartlek: 'bg-pink-500/85', race: 'bg-indigo-500/85',
  strength: 'bg-amber-500/85', cycling: 'bg-cyan-500/85',
};

// Monday (week start) of a yyyy-MM-dd date string.
export function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00');
  return addDays(d, -((d.getDay() + 6) % 7));
}

// ── Builder ───────────────────────────────────────────────────────────────────
// `lockedGroupId` (number) → the plan is scoped to that group (group plan).
// undefined/null → a general plan, private to the creator.
export default function TemplateBuilder({ initial, onClose, onSaved, lockedGroupId = null }) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description || '');
  const [weeks, setWeeks] = useState(initial.weeks_count);
  // day map: "week-dow" -> [ {workout_type, title, content, warmup, main_session, cooldown, distance_km}, ... ]
  // Multiple workouts may share a day; the array order is the saved `position` order.
  const [dayMap, setDayMap] = useState(() => {
    const m = {};
    (initial.days || []).forEach((d) => {
      const k = cellKey(d.week_number, d.day_of_week);
      (m[k] ||= []).push({
        workout_type: d.workout_type, title: d.title || '', content: d.content || '',
        warmup: d.warmup || '', main_session: d.main_session || '', cooldown: d.cooldown || '',
        distance_km: d.distance_km ?? '',
      });
    });
    return m;
  });
  const [editCell, setEditCell] = useState(null); // {week, dow}
  // Carousel index per cell ("week-dow" -> index) so a multi-workout day can show
  // the main first and switch through the rest, like the athlete training log.
  const [cellIdx, setCellIdx] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [expandedZoom, setExpandedZoom] = useState(0.8);
  const expandedScrollRef = useRef(null);
  const pinchRef = useRef({ startDist: 0, startZoom: 1 });

  // Pinch-to-zoom on touch + Ctrl/Cmd-scroll on desktop, scoped to the
  // expanded plan view's scroll container. The +/− buttons keep working too.
  useEffect(() => {
    if (!expanded) return;
    const el = expandedScrollRef.current;
    if (!el) return;
    const clamp = (v) => +Math.max(0.3, Math.min(1.8, v)).toFixed(2);

    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setExpandedZoom((z) => clamp(z + (e.deltaY > 0 ? -0.05 : 0.05)));
    };
    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current.startDist = Math.hypot(dx, dy);
      setExpandedZoom((z) => { pinchRef.current.startZoom = z; return z; });
    };
    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || !pinchRef.current.startDist) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const ratio = Math.hypot(dx, dy) / pinchRef.current.startDist;
      setExpandedZoom(clamp(pinchRef.current.startZoom * ratio));
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

  // Per-week planned volume target (string while editing). {week -> "50"}
  const [weekTargets, setWeekTargets] = useState(() => {
    const m = {};
    Object.entries(initial.week_targets || {}).forEach(([w, v]) => { m[String(w)] = String(v); });
    return m;
  });
  const setTarget = (week, val) => setWeekTargets((p) => ({ ...p, [String(week)]: val }));

  // Sum of distances written into a week's cells (the "written" km).
  const writtenKm = (week) => DOW_ORDER.reduce((s, dow) => s + cellKm(dayMap[cellKey(week, dow)]), 0);

  // Replace a cell's whole workout list. An empty list removes the cell.
  const setCell = (week, dow, list) => {
    setDayMap((prev) => {
      const next = { ...prev };
      if (!list || list.length === 0) delete next[cellKey(week, dow)];
      else next[cellKey(week, dow)] = list;
      return next;
    });
  };

  // Reset confirmation: null | { type: 'plan' } | { type: 'week', week }
  const [confirmReset, setConfirmReset] = useState(null);

  const resetPlan = () => { setDayMap({}); setWeekTargets({}); setCellIdx({}); };
  const resetWeek = (week) => {
    setDayMap((prev) => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        if (Number(k.split('-')[0]) !== week) next[k] = v;
      });
      return next;
    });
    setWeekTargets((prev) => { const next = { ...prev }; delete next[String(week)]; return next; });
  };
  const doReset = () => {
    if (confirmReset?.type === 'plan') resetPlan();
    else if (confirmReset?.type === 'week') resetWeek(confirmReset.week);
    setConfirmReset(null);
  };

  // Unsaved-changes guard on Back. Any edit to plan content flips `dirty`.
  const [confirmExit, setConfirmExit] = useState(false);
  const [dirty, setDirty] = useState(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    setDirty(true);
  }, [name, description, weeks, dayMap, weekTargets]);
  const handleBack = () => { if (dirty) setConfirmExit(true); else onClose(); };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    // Flatten each cell's list into individual day rows. Arrival order within a
    // cell becomes the backend `position` (the calendar shows them in this order).
    const days = [];
    Object.entries(dayMap).forEach(([k, list]) => {
      const [w, d] = k.split('-').map(Number);
      if (w > weeks) return;
      (list || []).forEach((v) => {
        days.push({
          week_number: w, day_of_week: d, ...v,
          distance_km: !tracksDistance(v.workout_type) || v.distance_km === '' || v.distance_km == null ? null : parseFloat(v.distance_km),
        });
      });
    });
    const week_targets = {};
    Object.entries(weekTargets).forEach(([w, v]) => {
      const n = parseFloat(v);
      if (Number(w) <= weeks && n > 0) week_targets[w] = n;
    });
    const body = {
      name: name.trim(), description: description.trim() || null,
      weeks_count: weeks, days, week_targets,
      group_id: lockedGroupId ? Number(lockedGroupId) : null,
    };
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
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <button onClick={handleBack} className="text-white/60 hover:text-white flex items-center gap-2 transition-colors text-sm">
          <span className="text-base leading-none">←</span> Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirmReset({ type: 'plan' })}
            className="bg-red-500 hover:bg-red-400 text-black px-3 py-2 rounded-lg text-sm font-medium transition active:scale-95"
          >
            Reset plan
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#c0c1ff] hover:bg-[#a9aaff] text-[#1000a9] px-5 py-2 rounded-lg font-medium shadow-lg shadow-[#c0c1ff]/30 transition active:scale-95 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-300 text-sm bg-red-500/15 border border-red-400/30 rounded-lg p-2">{error}</p>}

      {/* Plan details */}
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Plan name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${BUILDER_INPUT} px-4 py-3 text-lg font-medium`}
        />
        <input
          type="text"
          placeholder="Plan description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${BUILDER_INPUT} px-4 py-3`}
        />
        <p className="text-xs text-white/45">
          {lockedGroupId
            ? 'Group plan - shared with this group’s coaches. Only the main coach can apply it to the group.'
            :''}
        </p>
      </div>

      {/* Weeks selector */}
      <div className={`flex items-center gap-4 ${PANEL} rounded-2xl p-4 w-fit`}>
        <span className="text-white/60 font-medium">Weeks:</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWeeks((w) => Math.max(1, w - 1))}
            className="w-8 h-8 rounded-lg bg-slate-700/50 hover:bg-slate-600 border border-slate-600/50 text-white flex items-center justify-center transition active:scale-95"
          >−</button>
          <span className="text-xl font-bold w-6 text-center text-white">{weeks}</span>
          <button
            onClick={() => setWeeks((w) => Math.min(26, w + 1))}
            className="w-8 h-8 rounded-lg bg-slate-700/50 hover:bg-slate-600 border border-slate-600/50 text-white flex items-center justify-center transition active:scale-95"
          >+</button>
        </div>
      </div>

      {/* Expand button — opens the clear, large per-week view */}
      <button
        onClick={() => setExpanded(true)}
        className={`${PANEL} w-full rounded-2xl py-3 flex items-center justify-center gap-2 text-sm font-medium text-white/90 hover:bg-white/5 active:scale-[0.99] transition`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M4 4h6M4 4v6M4 4l6 6M20 20h-6M20 20v-6M20 20l-6-6" />
        </svg>
        Expand plan view
      </button>

      {/* Training grid */}
      <div className={`${PANEL} rounded-2xl p-4 overflow-x-auto`}>
        <div className="w-full">
          {/* Days header */}
          <div className="grid grid-cols-[1rem_repeat(7,1fr)_1.6rem_1.25rem] gap-1 mb-1.5 px-1">
            <div />
            {DOW_ORDER.map((dow) => (
              <div key={dow} className="text-center text-white/50 text-[9px] font-semibold uppercase tracking-wider">{DOW[dow]}</div>
            ))}
            <div />
            <div />
          </div>
          {/* Week rows */}
          <div className="space-y-1">
            {Array.from({ length: weeks }, (_, wi) => wi + 1).map((week) => {
              const weekKm = writtenKm(week);
              const target = parseFloat(weekTargets[week]) || 0;
              return (
              <div key={week} className="grid grid-cols-[1rem_repeat(7,1fr)_1.6rem_1.25rem] gap-1 items-center px-1 py-0.5 hover:bg-white/5 rounded-lg transition-colors">
                <div className="text-white/50 font-medium text-[10px]">W{week}</div>
                {DOW_ORDER.map((dow) => {
                  const key = cellKey(week, dow);
                  const list = dayMap[key] || [];
                  const multi = list.length > 1;
                  const idx = Math.min(cellIdx[key] || 0, Math.max(0, list.length - 1));
                  const active = list[idx];
                  const meta = active ? typeMeta(active.workout_type) : null;
                  return (
                    <button
                      key={dow}
                      onClick={() => setEditCell({ week, dow })}
                      className={`relative h-10 rounded-lg px-0.5 flex flex-col items-center justify-center text-center leading-none transition ${
                        active
                          ? `${CELL_COLOR[active.workout_type] || 'bg-slate-500/85'} text-white shadow-md`
                          : 'bg-slate-700/40 border border-dashed border-slate-400/30 text-slate-400 hover:bg-slate-700/60 hover:border-slate-400/60'
                      }`}
                    >
                      {active ? (
                        <>
                          {multi && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); setCellIdx((m) => ({ ...m, [key]: (idx + 1) % list.length })); }}
                              className="absolute top-0.5 right-0.5 text-[7px] font-bold bg-black/40 hover:bg-black/60 rounded px-0.5 leading-none cursor-pointer"
                            >{idx + 1}/{list.length}</span>
                          )}
                          <span className="text-[7px] font-medium leading-tight line-clamp-2">{meta.label}</span>
                          {parseFloat(active.distance_km) > 0 && (
                            <span className="text-[8px] font-bold mt-0.5">{Number(parseFloat(active.distance_km).toFixed(1))} km</span>
                          )}
                        </>
                      ) : '+'}
                    </button>
                  );
                })}
                <div className="text-[9px] font-bold text-left pl-0.5 leading-tight">
                  <span className={target > 0 && weekKm >= target ? 'text-emerald-300' : 'text-white'}>{weekKm > 0 ? Number(weekKm.toFixed(1)) : '0'}</span>
                  {target > 0 && <span className="text-white/45">/{Number(target)}</span>}
                </div>
                <button
                  onClick={() => setConfirmReset({ type: 'week', week })}
                  title={`Reset week ${week}`}
                  aria-label={`Reset week ${week}`}
                  className="h-10 w-full rounded-lg flex items-center justify-center text-white/30 hover:text-red-300 hover:bg-red-500/10 transition text-sm"
                >↺</button>
              </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Expanded full-screen view — large day cells + per-week written/target */}
      <Modal open={expanded} onClose={() => setExpanded(false)} title={name || 'Plan'} fullScreen panelClassName="bg-[#131314]">
        {/* Zoom controls */}
        <div className="flex items-center justify-end gap-2 mb-2">
          <span className="text-xs text-white/60">Zoom</span>
          <button
            onClick={() => setExpandedZoom((z) => Math.max(0.3, +(z - 0.05).toFixed(2)))}
            disabled={expandedZoom <= 0.3}
            className="w-7 h-7 rounded border border-white/20 bg-white/5 text-white text-sm font-bold hover:bg-white/15 disabled:opacity-30 transition"
          >−</button>
          <span className="text-xs font-mono w-10 text-center text-white/85">{Math.round(expandedZoom * 100)}%</span>
          <button
            onClick={() => setExpandedZoom((z) => Math.min(1.8, +(z + 0.05).toFixed(2)))}
            disabled={expandedZoom >= 1.8}
            className="w-7 h-7 rounded border border-white/20 bg-white/5 text-white text-sm font-bold hover:bg-white/15 disabled:opacity-30 transition"
          >+</button>
        </div>
        <div ref={expandedScrollRef} className="overflow-x-auto -mx-2" style={{ touchAction: 'pan-x pan-y' }}>
          <div className="px-2" style={{ minWidth: '880px', zoom: expandedZoom }}>
            {/* Plan total */}
            {(() => {
              const totWritten = Array.from({ length: weeks }, (_, i) => writtenKm(i + 1)).reduce((a, b) => a + b, 0);
              const totTarget = Array.from({ length: weeks }, (_, i) => parseFloat(weekTargets[i + 1]) || 0).reduce((a, b) => a + b, 0);
              return (
                <div className="flex items-baseline justify-between mb-3 pb-3 border-b border-white/15">
                  <span className="text-sm font-semibold text-white/85">{weeks} week{weeks !== 1 ? 's' : ''}</span>
                  <span className="text-sm">
                    <span className="font-bold text-[#c0c1ff]">{Number(totWritten.toFixed(1))} km</span>
                    {totTarget > 0 && <span className="text-white/50"> / {Number(totTarget.toFixed(1))} planned</span>}
                  </span>
                </div>
              );
            })()}

            {/* Day headers (Sunday-first to match the builder grid) */}
            <div className="grid gap-1 mb-1 text-xs text-white/55 text-center font-medium" style={{ gridTemplateColumns: 'repeat(7, 1fr) 130px' }}>
              {DOW_ORDER.map((dow) => <div key={dow}>{DOW[dow]}</div>)}
              <div className="text-right pr-1">Week</div>
            </div>

            <div className="space-y-1">
              {Array.from({ length: weeks }, (_, wi) => wi + 1).map((week) => {
                const weekKm = writtenKm(week);
                const target = parseFloat(weekTargets[week]) || 0;
                const reached = target > 0 && weekKm >= target;
                return (
                  <div key={week} className="grid gap-1 items-stretch" style={{ gridTemplateColumns: 'repeat(7, 1fr) 130px' }}>
                    {DOW_ORDER.map((dow) => {
                      const key = cellKey(week, dow);
                      const list = dayMap[key] || [];
                      const multi = list.length > 1;
                      const idx = Math.min(cellIdx[key] || 0, Math.max(0, list.length - 1));
                      const active = list[idx];
                      const meta = active ? typeMeta(active.workout_type) : null;
                      const isRace = active?.workout_type === 'race';
                      const body = active ? (active.content || active.main_session || active.warmup || '') : '';
                      const activeKm = active ? (parseFloat(active.distance_km) || 0) : 0;
                      return (
                        <button
                          key={dow}
                          onClick={() => setEditCell({ week, dow })}
                          className={`rounded-lg ${isRace ? 'border-2 border-[#8083ff]' : 'border border-white/10'} flex flex-col text-left transition overflow-hidden ${
                            active ? 'bg-white/[0.07] hover:bg-white/[0.12]' : 'bg-white/[0.02] hover:bg-white/[0.06] border-dashed'
                          }`}
                          style={{ minHeight: '116px' }}
                        >
                          <div className="flex items-start justify-between px-2 pt-1.5 gap-1">
                            <span className="flex items-center gap-1">
                              <span className="text-[10px] text-white/40 font-semibold leading-none">W{week}</span>
                              {multi && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); setCellIdx((m) => ({ ...m, [key]: (idx + 1) % list.length })); }}
                                  className="text-[9px] text-[#c0c1ff] font-bold leading-none px-1 py-0.5 rounded bg-white/10 hover:bg-white/25 cursor-pointer transition"
                                  title="Switch workout"
                                >{idx + 1}/{list.length} ›</span>
                              )}
                            </span>
                            {meta && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none ${meta.color}`}>{meta.label}</span>
                            )}
                          </div>
                          <div className="flex-1 px-2 py-1 min-h-0 flex flex-col">
                            {active?.title && (
                              <p className="text-xs font-semibold leading-tight line-clamp-2 text-white">{isRace && '🏁 '}{active.title}</p>
                            )}
                            {!active?.title && isRace && <p className="text-xs font-semibold leading-tight text-[#c0c1ff]">🏁 Race</p>}
                            {body && <p className="text-[10px] text-white/60 leading-tight line-clamp-3 mt-0.5 whitespace-pre-wrap">{body}</p>}
                            {(() => {
                              const total = cellKm(list);
                              if (total <= 0) return null;
                              const showPer = multi && activeKm > 0;
                              return (
                                <div className={`flex items-end mt-auto ${showPer ? 'justify-between' : 'justify-end'}`}>
                                  {showPer && <span className="text-[10px] text-white/55 font-semibold leading-none">{Number(activeKm.toFixed(1))} km</span>}
                                  <span className="text-[11px] text-[#c0c1ff] font-bold leading-none">{Number(total.toFixed(1))} km</span>
                                </div>
                              );
                            })()}
                            {!active && <span className="text-white/25 text-lg m-auto">+</span>}
                          </div>
                        </button>
                      );
                    })}
                    {/* Week target + written column */}
                    <div className="flex flex-col items-end justify-center gap-1 px-1">
                      <div className="text-sm font-bold leading-none">
                        <span className={reached ? 'text-emerald-300' : 'text-[#c0c1ff]'}>{Number(weekKm.toFixed(1))}</span>
                        <span className="text-white/45 text-xs"> km</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-white/40">/</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder="target"
                          value={weekTargets[week] ?? ''}
                          onChange={(e) => setTarget(week, e.target.value)}
                          className="w-16 bg-slate-900/50 border border-slate-600/40 rounded-md px-1.5 py-1 text-xs text-white text-right placeholder-slate-500 focus:outline-none focus:border-[#c0c1ff]"
                        />
                      </div>
                      <button
                        onClick={() => setConfirmReset({ type: 'week', week })}
                        className="text-[10px] text-white/40 hover:text-red-300 transition mt-0.5"
                      >↺ Reset week</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-white/40 mt-3">Tap any day to edit. Set a weekly target to track written vs planned km — the written total turns green once you reach it.</p>
          </div>
        </div>
      </Modal>

      <Modal open={confirmExit} onClose={() => setConfirmExit(false)} panelClassName="bg-[#131314] border-t border-white/10">
        <h3 className="text-base font-bold text-white mb-2">Save changes?</h3>
        <p className="text-sm text-white/60 mb-5">You have unsaved changes to this plan.</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => { setConfirmExit(false); handleSave(); }}
            disabled={saving}
            className="bg-[#c0c1ff] hover:bg-[#a9aaff] text-[#1000a9] rounded-xl py-2.5 text-sm font-bold disabled:opacity-50 transition active:scale-95"
          >
            {saving ? 'Saving…' : 'Save & exit'}
          </button>
          <button
            onClick={() => { setConfirmExit(false); onClose(); }}
            className="bg-red-500 hover:bg-red-400 text-black rounded-xl py-2.5 text-sm font-bold transition active:scale-95"
          >
            Exit without saving
          </button>
          <button onClick={() => setConfirmExit(false)} className="border border-white/15 text-white/70 rounded-xl py-2.5 text-sm font-semibold hover:bg-white/5 transition">Cancel</button>
        </div>
      </Modal>

      <Modal open={!!confirmReset} onClose={() => setConfirmReset(null)} panelClassName="bg-[#131314] border-t border-white/10">
        <h3 className="text-base font-bold text-white mb-2">
          {confirmReset?.type === 'plan' ? 'Reset entire plan?' : `Reset week ${confirmReset?.week}?`}
        </h3>
        <p className="text-sm text-white/60 mb-5">
          {confirmReset?.type === 'plan'
            ? 'This clears every workout and weekly target across all weeks. It only takes effect once you save — leave without saving to undo.'
            : 'This clears every workout and the target for this week. It only takes effect once you save — leave without saving to undo.'}
        </p>
        <div className="flex gap-2">
          <button onClick={() => setConfirmReset(null)} className="flex-1 border border-white/15 text-white/70 rounded-xl py-2.5 text-sm font-semibold hover:bg-white/5 transition">Cancel</button>
          <button onClick={doReset} className="flex-1 bg-red-500/90 hover:bg-red-500 text-white rounded-xl py-2.5 text-sm font-bold active:scale-95 transition">Reset</button>
        </div>
      </Modal>

      {editCell && (
        <CellEditor
          week={editCell.week}
          dow={editCell.dow}
          value={dayMap[cellKey(editCell.week, editCell.dow)]}
          onChange={(list) => setCell(editCell.week, editCell.dow, list)}
          onClose={() => setEditCell(null)}
        />
      )}
    </div>
  );
}

// Multi-workout cell editor. Shows the day's workout list (add / edit / delete),
// committing the whole list back to the parent on every change via `onChange`.
function CellEditor({ week, dow, value, onChange, onClose }) {
  const [list, setList] = useState(() => (value || []).map((w) => ({ ...w })));
  // null = list view; 'new' = adding; number = editing that index.
  const [editingIdx, setEditingIdx] = useState((value || []).length === 0 ? 'new' : null);
  const [form, setForm] = useState(EMPTY_DAY);
  const meta = typeMeta(form.workout_type);
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const applyList = (next) => { setList(next); onChange(next); };

  const openForm = (idx) => {
    setForm(idx === 'new' ? EMPTY_DAY : { ...list[idx] });
    setEditingIdx(idx);
  };
  const saveForm = () => {
    const next = editingIdx === 'new' ? [...list, form] : list.map((w, i) => (i === editingIdx ? form : w));
    applyList(next);
    setEditingIdx(next.length === 0 ? 'new' : null);
  };
  const deleteAt = (idx) => {
    const next = list.filter((_, i) => i !== idx);
    applyList(next);
  };
  // "Main" = first in the cell (shown first on the calendar). Move this one to front.
  const makeMain = (idx) => applyList([list[idx], ...list.filter((_, i) => i !== idx)]);

  const INPUT = 'w-full bg-[#1c1b1c]/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20';

  return (
    <Modal open onClose={onClose} panelClassName="bg-[#131314] border-t border-white/10">
      <h3 className="font-semibold mb-1 text-white">Week {week} · {DOW[dow]}</h3>

      {editingIdx === null ? (
        // ── List of the day's workouts ──────────────────────────────────────
        <div className="space-y-2 mt-2">
          {list.map((w, idx) => {
            const tm = typeMeta(w.workout_type);
            const km = parseFloat(w.distance_km) || 0;
            return (
              <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.05] p-3 flex items-start justify-between gap-2">
                <button onClick={() => openForm(idx)} className="min-w-0 text-left flex-1">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${tm.color}`}>{tm.label}</span>
                    {idx === 0 && list.length > 1 && <span className="text-[10px] text-yellow-300 font-semibold">★ main</span>}
                    {km > 0 && <span className="text-[11px] font-semibold text-[#c0c1ff]">{Number(km.toFixed(1))} km</span>}
                  </span>
                  {(w.title || w.workout_type === 'race') && (
                    <p className="text-sm font-semibold text-white mt-1">{w.workout_type === 'race' && '🏁 '}{w.title || tm.label}</p>
                  )}
                  {tm.structured ? (
                    <div className="text-xs text-white/75 space-y-0.5 mt-1">
                      {w.warmup && <p><span className="text-[10px] uppercase tracking-wider text-white/40">WU · </span><span className="whitespace-pre-wrap">{w.warmup}</span></p>}
                      {w.main_session && <p><span className="text-[10px] uppercase tracking-wider text-white/40">{tm.mainLabel || 'Main'} · </span><span className="whitespace-pre-wrap">{w.main_session}</span></p>}
                      {w.cooldown && <p><span className="text-[10px] uppercase tracking-wider text-white/40">CD · </span><span className="whitespace-pre-wrap">{w.cooldown}</span></p>}
                    </div>
                  ) : (
                    w.content && <p className="text-xs text-white/75 whitespace-pre-wrap mt-1">{w.content}</p>
                  )}
                </button>
                <div className="flex flex-col gap-1 shrink-0">
                  {idx !== 0 && (
                    <button onClick={() => makeMain(idx)}
                      className="text-[11px] px-2 py-1 rounded border border-yellow-400/40 text-yellow-300 hover:bg-yellow-500/15"
                      title="Make this the main workout (shown first)">★ Main</button>
                  )}
                  <button onClick={() => deleteAt(idx)}
                    className="text-[11px] px-2 py-1 rounded border border-red-400/30 text-red-300 hover:bg-red-500/15">Delete</button>
                </div>
              </div>
            );
          })}
          <button onClick={() => openForm('new')}
            className="w-full border border-[#c0c1ff]/40 text-[#c0c1ff] rounded-xl py-2.5 text-sm font-bold hover:bg-[#c0c1ff]/10">
            + Add workout
          </button>
          <button onClick={onClose}
            className="w-full border border-white/20 text-white/70 rounded-xl py-2.5 text-sm font-medium hover:bg-white/10">
            Done
          </button>
        </div>
      ) : (
        // ── Add / edit one workout ──────────────────────────────────────────
        <div className="space-y-3 mt-2">
          {list.length > 0 && (
            <button onClick={() => setEditingIdx(null)} className="text-xs text-white/50 hover:text-white">← Back to day</button>
          )}
          <div className="flex flex-wrap gap-1">
            {WORKOUT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => upd('workout_type', t.value)}
                className={`text-xs px-2 py-1 rounded-full border ${
                  form.workout_type === t.value ? t.color + ' border-transparent font-medium' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <input type="text" placeholder="Title (optional)" value={form.title}
            onChange={(e) => upd('title', e.target.value)} className={INPUT} />

          {tracksDistance(form.workout_type) && (
            <input type="number" inputMode="decimal" placeholder="Distance (km)" value={form.distance_km}
              onChange={(e) => upd('distance_km', e.target.value)} className={INPUT} />
          )}

          {meta.structured ? (
            <>
              <textarea placeholder="Warm-up" value={form.warmup} onChange={(e) => upd('warmup', e.target.value)} rows={2} className={INPUT} />
              <textarea placeholder={meta.mainLabel || 'Main session'} value={form.main_session} onChange={(e) => upd('main_session', e.target.value)} rows={2} className={INPUT} />
              <textarea placeholder="Cool-down" value={form.cooldown} onChange={(e) => upd('cooldown', e.target.value)} rows={2} className={INPUT} />
            </>
          ) : (
            <textarea placeholder="Details (optional)" value={form.content} onChange={(e) => upd('content', e.target.value)} rows={3} className={INPUT} />
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={saveForm}
              className="flex-1 bg-[#c0c1ff] text-[#1000a9] rounded-lg py-2 text-sm font-medium hover:bg-[#a9aaff]">
              {editingIdx === 'new' ? 'Add' : 'Save'}
            </button>
            <button onClick={() => (list.length === 0 ? onClose() : setEditingIdx(null))}
              className="px-4 border border-white/20 text-white/70 rounded-lg py-2 text-sm hover:bg-white/10 transition">
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Group apply (main coach only) ─────────────────────────────────────────────
// `fixedGroupId` (number) locks the group (used from the Group hub).
export function GroupApplyModal({ template, onClose, fixedGroupId = null }) {
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState(fixedGroupId ? String(fixedGroupId) : '');
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
      if (!fixedGroupId) {
        const preferred = template.group_id && data.some((g) => g.id === template.group_id)
          ? template.group_id : data[0]?.id;
        if (preferred) setGroupId(String(preferred));
      }
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
    <Modal open onClose={onClose} panelClassName="bg-[#131314] border-t border-white/10">
      <h3 className="font-semibold mb-1 text-white">Apply "{template.name}" to the group</h3>
      <p className="text-xs text-white/50 mb-3">
        {template.weeks_count} weeks · {template.day_count} workouts. The start date snaps to its Monday.
      </p>

      {step === 'result' ? (
        <div className="space-y-3">
          <div className="bg-emerald-500/15 border border-emerald-400/30 rounded-lg p-3 text-sm text-emerald-200">
            Created {result.created} workouts from {result.start_monday} to {result.end_date}
            {result.replaced > 0 && `, replacing ${result.replaced} existing`}.
          </div>
          <button onClick={onClose} className="w-full bg-[#c0c1ff] text-[#1000a9] rounded-lg py-2 text-sm font-medium hover:bg-[#a9aaff]">Done</button>
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
          <div className="bg-amber-500/15 border border-amber-400/30 rounded-lg p-3 text-sm text-amber-100">
            {replaceCount === null
              ? 'Checking existing workouts…'
              : replaceCount > 0
                ? <>This <strong>replaces {replaceCount} existing workout{replaceCount !== 1 ? 's' : ''}</strong> in {groupName ? `“${groupName}”` : 'the group'} across the plan's {template.weeks_count} week{template.weeks_count !== 1 ? 's' : ''} (from the Monday of {startDate}), then writes the plan. This can't be undone.</>
                : <>No existing workouts in {groupName ? `“${groupName}”` : 'the group'} over the plan's {template.weeks_count} week{template.weeks_count !== 1 ? 's' : ''} — the plan will be added cleanly.</>}
          </div>
          {error && <p className="text-red-300 text-sm bg-red-500/15 border border-red-400/30 rounded p-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setStep('diff')} className="px-4 border border-[#c0c1ff]/50 text-[#c0c1ff] rounded-lg py-2 text-sm font-medium hover:bg-[#c0c1ff]/10">See diff</button>
            <button onClick={doApply} disabled={applying} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {applying ? 'Applying…' : 'Apply & override'}
            </button>
          </div>
          <button onClick={() => setStep('form')} className="w-full text-sm text-white/50 hover:text-white">Back</button>
        </div>
      ) : (
        <div className="space-y-3">
          {!fixedGroupId && (
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Group</label>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1">Start date (week 1, Monday)</label>
            <input type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={() => { if (groupId && startDate) setStep('confirm'); }} disabled={!groupId || !startDate} className="w-full bg-[#c0c1ff] text-[#1000a9] rounded-lg py-2 text-sm font-medium hover:bg-[#a9aaff] disabled:opacity-50">
            Apply to calendar
          </button>
        </div>
      )}
    </Modal>
  );
}

// ── Athlete apply (private plans) ─────────────────────────────────────────────
export function AthleteApplyModal({ template, onClose }) {
  const [athletes, setAthletes] = useState([]);
  const [athleteId, setAthleteId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [override, setOverride] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null); // detail string when replace needed

  const today = new Date().toISOString().slice(0, 10);
  const athleteName = athletes.find((a) => String(a.id) === String(athleteId))?.full_name || '';

  useEffect(() => {
    listAthletes().then(({ data }) => setAthletes(data)).catch(() => {});
  }, []);

  const doApply = async (replace) => {
    setApplying(true);
    setError('');
    try {
      const { data } = await applyTemplateToAthlete(template.id, {
        athlete_id: Number(athleteId), start_date: startDate,
        override_group: override, replace,
      });
      setResult(data);
      setConflict(null);
    } catch (err) {
      if (err.response?.status === 409) setConflict(err.response.data?.detail || 'Existing workouts will be replaced.');
      else setError(err.response?.data?.detail || 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal open onClose={onClose} panelClassName="bg-[#131314] border-t border-white/10">
      <h3 className="font-semibold mb-1 text-white">Apply "{template.name}" to an athlete</h3>
      <p className="text-xs text-white/50 mb-3">
        {template.weeks_count} weeks · {template.day_count} workouts. The start date snaps to its Monday.
      </p>

      {result ? (
        <div className="space-y-3">
          <div className="bg-emerald-500/15 border border-emerald-400/30 rounded-lg p-3 text-sm text-emerald-200">
            Assigned {result.created} workouts to {athleteName || 'the athlete'} from {result.start_monday} to {result.end_date}
            {result.replaced > 0 && `, replacing ${result.replaced} existing`}.
          </div>
          <button onClick={onClose} className="w-full bg-[#c0c1ff] text-[#1000a9] rounded-lg py-2 text-sm font-medium hover:bg-[#a9aaff]">Done</button>
        </div>
      ) : conflict ? (
        <div className="space-y-3">
          <div className="bg-amber-500/15 border border-amber-400/30 rounded-lg p-3 text-sm text-amber-100">{conflict}</div>
          {error && <p className="text-red-300 text-sm bg-red-500/15 border border-red-400/30 rounded p-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setConflict(null)} className="px-4 border border-white/20 text-white/80 rounded-lg py-2 text-sm hover:bg-white/10 transition">Back</button>
            <button onClick={() => doApply(true)} disabled={applying} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {applying ? 'Applying…' : 'Replace & apply'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1">Athlete</label>
            <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select an athlete…</option>
              {athletes.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1">Start date (week 1, Monday)</label>
            <input type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-start gap-2 text-sm text-white/80 cursor-pointer">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5" />
            <span>Override the group workout
              <span className="block text-[11px] text-white/45">Off (default): the athlete sees this alongside the group workout. On: this replaces the group workout for them.</span>
            </span>
          </label>
          {error && <p className="text-red-300 text-sm bg-red-500/15 border border-red-400/30 rounded p-2">{error}</p>}
          <button onClick={() => doApply(false)} disabled={!athleteId || !startDate || applying} className="w-full bg-[#c0c1ff] text-[#1000a9] rounded-lg py-2 text-sm font-medium hover:bg-[#a9aaff] disabled:opacity-50">
            {applying ? 'Applying…' : 'Apply to athlete'}
          </button>
        </div>
      )}
    </Modal>
  );
}

// Now / After comparison for a group plan apply.
function DiffCalendar({ templateId, weeksCount, groupId, startMonday, onBack, onApply, applying }) {
  const [oldMap, setOldMap] = useState(null);
  const [newMap, setNewMap] = useState(null);
  const [view, setView] = useState('after'); // now | after

  useEffect(() => {
    let alive = true;
    getTemplate(templateId).then(({ data }) => {
      if (!alive) return;
      const m = {};
      data.days.forEach((d) => {
        const dt = addDays(startMonday, (d.week_number - 1) * 7 + d.day_of_week);
        m[format(dt, 'yyyy-MM-dd')] = { workout_type: d.workout_type, title: d.title || typeMeta(d.workout_type).label };
      });
      setNewMap(m);
    }).catch(() => setNewMap({}));

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
          const gw = list[list.length - 1];
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
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
        {[['now', 'Now'], ['after', 'After applying']].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} className={`flex-1 py-1.5 rounded-md text-sm font-medium transition ${view === k ? 'bg-[#c0c1ff] text-[#1000a9]' : 'text-white/50 hover:text-white'}`}>{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] text-white/40 text-center font-medium">
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
                <div key={key} className={`rounded-md border p-1 min-h-[3.2rem] ${changed ? 'border-amber-400/70 ring-1 ring-amber-300/40' : 'border-white/10'} ${cell ? 'bg-white/10' : 'bg-white/[0.03]'}`}>
                  <div className="text-[9px] text-white/40">{format(dt, 'd')}</div>
                  {tm && <span className={`inline-block text-[8px] px-1 rounded ${tm.color} font-medium`}>{tm.label}</span>}
                  {cell?.title && <p className="text-[8px] text-white/60 leading-tight line-clamp-2 mt-0.5">{cell.title}</p>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-white/40">Amber-outlined days change. “After” shows only the plan’s workouts — everything else in these weeks is cleared.</p>

      <div className="flex gap-2">
        <button onClick={onBack} className="px-4 border border-white/20 text-white/80 rounded-lg py-2 text-sm hover:bg-white/10 transition">Back</button>
        <button onClick={onApply} disabled={applying} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
          {applying ? 'Applying…' : 'Apply & override'}
        </button>
      </div>
    </div>
  );
}
