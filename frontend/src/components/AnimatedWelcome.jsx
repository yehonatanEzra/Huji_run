export default function AnimatedWelcome({ name }) {
  const text = name || 'Runner';
  return (
    <div className="welcome-loader-wrapper text-3xl sm:text-4xl">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="relative inline-block leading-none">
        {[...text].map((ch, i) => (
          <span
            key={i}
            className="welcome-letter"
            style={{ animationDelay: `${0.1 + i * 0.105}s` }}
          >
            {ch}
          </span>
        ))}
        <span className="welcome-loader-scan" />
      </span>
    </div>
  );
}
