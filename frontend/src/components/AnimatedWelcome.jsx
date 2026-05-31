export default function AnimatedWelcome({ name, color }) {
  const text = name || 'Runner';

  // 1. Each letter is its own inline-block, which breaks the browser's BiDi flow.
  // If the text contains Hebrew (or Arabic), set dir="rtl" so the letters lay out right-to-left.
  const isRtl = /[֐-׿؀-ۿ]/.test(text);

  return (
    <div className="welcome-loader-wrapper text-3xl sm:text-4xl" style={color ? { color } : undefined}>
      <span className="sr-only">{text}</span>
      <span                
        aria-hidden="true"                                                                                                                                                                                                            
        dir={isRtl ? 'rtl' : 'ltr'}                                                                                                                                                                                                   
        className="relative inline-block leading-none"                                                                                                                                                                                
      >                                                                                                                                                                                                                               
        {[...text].map((ch, i) => (
          <span
            key={i}
            className="welcome-letter inline-block"
            style={{ animationDelay: `${0.1 + i * 0.105}s` }}
          >
            {/* Replace spaces with non-breaking spaces to prevent collapsing in the animation */}
            {ch === ' ' ? '\u00A0' : ch}
          </span>
        ))}
        <span className="welcome-loader-scan" />
      </span>
    </div>
  );
}