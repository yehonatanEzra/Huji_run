export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="inline-flex flex-wrap gap-1 mb-4 p-1 rounded-xl bg-black/40 backdrop-blur-md border border-white/15 shadow-md">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
            active === tab.value
              ? 'bg-white text-black shadow'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
