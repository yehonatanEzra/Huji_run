import { Link } from 'react-router-dom';

const GLASS = 'bg-[#161616]/85 backdrop-blur-2xl border border-white/10';

const TOOLS = [
  {
    to: '/tools/calculator',
    title: 'Running calculator',
    desc: 'Training zones from your VDOT, plus World Athletics points.',
    icon: (
      <path d="M9 7h6m-6 4h6m-6 4h4M5 5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5z" />
    ),
  },
  {
    to: '/tools/todos',
    title: 'Todos',
    desc: 'Your private checklist and notes.',
    icon: (
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-6 0h.01M12 16h3m-6 0h.01" />
    ),
  },
];

export default function ToolsHubPage() {
  return (
    <>
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />

      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white">Tools</h1>
        <div className="grid grid-cols-1 gap-3">
          {TOOLS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className={`rounded-2xl p-4 flex items-center gap-4 transition hover:border-[#c0c1ff]/40 ${GLASS}`}
            >
              <span className="shrink-0 h-11 w-11 rounded-xl bg-[#c0c1ff]/15 text-[#c0c1ff] flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                  {t.icon}
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{t.title}</p>
                <p className="text-xs text-white/50">{t.desc}</p>
              </div>
              <span className="ml-auto text-white/30 text-lg">›</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
