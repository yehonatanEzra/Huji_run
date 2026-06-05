import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react';

export function FloatingDock({ items, className = '' }) {
  const mouseX = useMotionValue(Infinity);
  const scrollRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows);
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect(); };
  }, [items]);

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 80, behavior: 'smooth' });
  };

  return (
    <div className={`flex items-center rounded-2xl bg-black/50 backdrop-blur-md border border-white/15 px-2 pb-2 pt-1 gap-1 ${className}`}>
      {/* Left arrow */}
      <AnimatePresence>
        {canLeft && (
          <motion.button
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            onClick={() => scroll(-1)}
            className="text-white/60 hover:text-white text-base shrink-0 px-0.5"
          >
            ‹
          </motion.button>
        )}
      </AnimatePresence>

      {/* Scrollable items */}
      <motion.div
        ref={scrollRef}
        onMouseMove={(e) => mouseX.set(e.pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="flex items-end gap-1 overflow-x-auto scrollbar-hide"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {items.map((item) => (
          <DockItem mouseX={mouseX} key={item.to} {...item} />
        ))}
      </motion.div>

      {/* Right arrow */}
      <AnimatePresence>
        {canRight && (
          <motion.button
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            onClick={() => scroll(1)}
            className="text-white/60 hover:text-white text-base shrink-0 px-0.5"
          >
            ›
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function DockItem({ mouseX, to, label, icon, image, badge = 0 }) {
  const [imgFailed, setImgFailed] = useState(false);
  const ref = useRef(null);

  const distance = useTransform(mouseX, (val) => {
    const b = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - b.x - b.width / 2;
  });

  const widthT  = useTransform(distance, [-140, 0, 140], [38, 56, 38]);
  const heightT = useTransform(distance, [-140, 0, 140], [38, 56, 38]);
  const wIconT  = useTransform(distance, [-140, 0, 140], [20, 30, 20]);
  const hIconT  = useTransform(distance, [-140, 0, 140], [20, 30, 20]);

  const width  = useSpring(widthT,  { mass: 0.1, stiffness: 150, damping: 12 });
  const height = useSpring(heightT, { mass: 0.1, stiffness: 150, damping: 12 });
  const wIcon  = useSpring(wIconT,  { mass: 0.1, stiffness: 150, damping: 12 });
  const hIcon  = useSpring(hIconT,  { mass: 0.1, stiffness: 150, damping: 12 });

  const [hovered, setHovered] = useState(false);

  return (
    <NavLink
      to={to}
      className="flex flex-col items-center relative select-none shrink-0"
      style={{ scrollSnapAlign: 'center' }}
    >
      {({ isActive }) => (
        <>
          <motion.div
            ref={ref}
            style={{ width, height }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`relative flex items-center justify-center rounded-full transition-colors ${
              isActive ? 'bg-white/25 ring-1 ring-white/30' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            <AnimatePresence>
              {hovered && (
                <motion.div
                  initial={{ opacity: 0, y: 8, x: '-50%' }}
                  animate={{ opacity: 1, y: 0, x: '-50%' }}
                  exit={{ opacity: 0, y: 4, x: '-50%' }}
                  className="absolute -top-8 left-1/2 whitespace-pre rounded-md bg-black/80 px-2 py-0.5 text-xs text-white border border-white/20 pointer-events-none z-50"
                >
                  {label}
                </motion.div>
              )}
            </AnimatePresence>

            {badge > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full px-1 min-w-[14px] text-center leading-tight z-20">
                {badge}
              </span>
            )}

            {image && !imgFailed ? (
              // Image icons fill the full outer circle (the emoji-sized inner
              // wrapper made them look tiny). overflow-hidden + rounded-full
              // clip the image to the button's circular shape.
              <img
                src={image}
                alt=""
                onError={() => setImgFailed(true)}
                className="absolute inset-0 w-full h-full object-cover rounded-full"
                draggable={false}
              />
            ) : (
              <motion.div
                style={{ width: wIcon, height: hIcon }}
                className="relative flex items-center justify-center leading-none"
              >
                <span className="text-xl">{icon}</span>
              </motion.div>
            )}
          </motion.div>

          <span className={`text-[9px] mt-0.5 font-medium leading-none ${isActive ? 'text-white' : 'text-white/45'}`}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}
