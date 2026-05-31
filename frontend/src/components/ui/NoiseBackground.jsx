import { useId } from 'react';

export function NoiseBackground({
  children,
  containerClassName = '',
  gradientColors = ['rgb(59,130,246)', 'rgb(139,92,246)', 'rgb(236,72,153)'],
}) {
  const uid = useId().replace(/:/g, '');
  const gradient = `linear-gradient(135deg, ${gradientColors.join(', ')})`;

  return (
    <div className={`relative ${containerClassName}`} style={{ background: gradient }}>
      {/* Grain noise overlay — gives the gradient a tactile, non-flat feel */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id={uid}>
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${uid})`} />
      </svg>
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
