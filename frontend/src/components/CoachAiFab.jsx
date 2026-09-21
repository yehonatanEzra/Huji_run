import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Floating Coach AI button. Tap to open the assistant; drag to reposition it
// anywhere on screen (position persists in localStorage). A short label sits
// underneath. Lives next to the training log, where the AI reasons about the data.

const STORAGE_KEY = 'coachAiFabPos';
const SIZE = 56;      // w-14 (3.5rem)
const MARGIN = 12;    // keep the button off the very edge
const DRAG_THRESHOLD = 6; // px of movement before a press counts as a drag, not a tap

export default function CoachAiFab() {
  const navigate = useNavigate();
  const [pos, setPos] = useState(null); // {x, y} px from top-left; null = default bottom-right
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, offX: 0, offY: 0 });
  const latest = useRef(null);

  const clamp = useCallback((x, y) => ({
    x: Math.min(Math.max(MARGIN, x), window.innerWidth - SIZE - MARGIN),
    y: Math.min(Math.max(MARGIN, y), window.innerHeight - SIZE - MARGIN),
  }), []);

  // Restore saved position (clamped in case the viewport shrank).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.x === 'number' && typeof p?.y === 'number') setPos(clamp(p.x, p.y));
      }
    } catch { /* ignore */ }
  }, [clamp]);

  const onPointerDown = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      active: true, moved: false,
      startX: e.clientX, startY: e.clientY,
      offX: e.clientX - rect.left, offY: e.clientY - rect.top,
    };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d.active) return;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > DRAG_THRESHOLD) d.moved = true;
    if (d.moved) {
      const next = clamp(e.clientX - d.offX, e.clientY - d.offY);
      latest.current = next;
      setPos(next);
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    d.active = false;
    if (!d.moved) {
      navigate('/assistant'); // it was a tap
    } else if (latest.current) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(latest.current)); } catch { /* ignore */ }
    }
  };

  const style = pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: 112 };

  return (
    <div
      style={style}
      className="fixed z-40 flex flex-col items-center select-none touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="button"
      aria-label="Jonny — Coach AI"
      title="Jonny — tap to open, drag to move"
    >
      <div className="w-14 h-14 rounded-full bg-[#0b1e2d] flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing active:scale-95 transition shadow-[0_0_0_2px_rgba(56,198,255,0.6),0_0_22px_rgba(56,198,255,0.5),0_10px_24px_rgba(0,0,0,0.45)]">
        <img src="/coach-ai.png" alt="Jonny" draggable={false} className="w-full h-full object-cover scale-125 pointer-events-none" />
      </div>
      <span className="mt-1 text-[10px] font-semibold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.85)] pointer-events-none">
        Jonny
      </span>
    </div>
  );
}
