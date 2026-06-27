import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardWeek, pendingApprovalsCount, listGroups } from '../../api/coach';
import { incomingRequests } from '../../api/coaching';
import Spinner from '../../components/ui/Spinner';
import NextRaceCard from '../../components/races/NextRaceCard';

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const STATUS_PILL = {
  completed: { label: '✓ Completed', cls: 'bg-green-500/15 text-green-300' },
  partial: { label: '½ Partial', cls: 'bg-yellow-500/15 text-yellow-300' },
  missed: { label: '✗ Missed', cls: 'bg-red-500/15 text-red-300' },
};

export default function CoachHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nameTick, setNameTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNameTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    const today = format(new Date(), 'yyyy-MM-dd');
    Promise.allSettled([
      getDashboardWeek(today),
      incomingRequests(),
      pendingApprovalsCount(),
      listGroups(),
    ]).then(([dash, reqs, appr, groups]) => {
      if (!alive) return;
      const athletes = dash.status === 'fulfilled' ? (dash.value.data.athletes || []) : [];
      const todayReports = athletes
        .map((a) => {
          const day = (a.days || []).find((d) => d.date === today && d.log);
          return day ? { id: a.id, date: today, name: a.full_name, group: a.group_name, status: day.log.status, km: day.log.distance_km, loggedAt: day.log.logged_at } : null;
        })
        .filter(Boolean)
        .sort((x, y) => new Date(y.loggedAt) - new Date(x.loggedAt))
        .slice(0, 5);
      setData({
        athletes: athletes.length,
        todayReports,
        requests: reqs.status === 'fulfilled' ? (reqs.value.data || []).length : 0,
        approvals: appr.status === 'fulfilled' ? (appr.value.data.count || 0) : 0,
        groups: groups.status === 'fulfilled' ? (groups.value.data || []).length : 0,
      });
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const dateStr = format(new Date(), 'EEEE, MMM d');

  const attention = data ? [
    { key: 'req', count: data.requests, label: 'Join requests', to: '/coach/requests', tone: 'accent', icon: ICON_PERSON_ADD },
    { key: 'appr', count: data.approvals, label: 'Group approvals', to: '/coach/group', tone: 'accent', icon: ICON_GROUP_ADD },
  ].filter((a) => a.count > 0) : [];

  return (
    <div className="relative pb-8">
      <style>{`
        @keyframes letterReveal { from { opacity: 0; filter: blur(8px); transform: translateY(10px); } to { opacity: 1; filter: blur(0); transform: translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(150px); } to { opacity: 1; transform: translateX(0); } }
        .animate-letter-reveal { animation: letterReveal 0.7s ease-out forwards; }
        .animate-slide-in-right { animation: slideInRight 1s ease-out forwards; }
      `}</style>

      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />

      {/* Welcome hero */}
      <div key={nameTick} className="mb-4 px-1">
        <p className="text-sm font-semibold uppercase tracking-widest text-[#c0c1ff] opacity-0 animate-slide-in-right">Welcome back</p>
        <h1 className="mt-1 text-3xl font-black text-[#c0c1ff] [text-shadow:0_2px_12px_rgba(0,0,0,0.6)] inline-block">
          {(user?.full_name || 'Coach').split('').map((ch, i) => (
            <span key={i} className="inline-block opacity-0 animate-letter-reveal" style={{ animationDelay: `${0.9 + i * 0.09}s`, whiteSpace: 'pre' }}>{ch}</span>
          ))}
        </h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !data ? (
        <p className="text-center text-white/50 py-16">Could not load your home summary.</p>
      ) : (
        <div className="space-y-6">
          {/* Glass summary card — athlete-home style (frosted) */}
          <div className="w-full max-w-md mx-auto rounded-2xl shadow-xl ring-1 ring-white/25 overflow-hidden bg-white/25 backdrop-blur-md px-5 py-4">
            <p className="text-[11px] uppercase tracking-widest font-semibold text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">{dateStr}</p>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <button onClick={() => navigate('/coach/settings')} className="text-left active:scale-[0.98] transition">
                <SummaryStat value={data.athletes} label="Athletes ›" />
              </button>
              <button onClick={() => navigate('/coach/group')} className="text-left active:scale-[0.98] transition">
                <SummaryStat value={data.groups} label="Groups ›" />
              </button>
            </div>
          </div>

          <NextRaceCard />

          {/* Latest reports today */}
          <section>
            <h2 className="text-base font-semibold text-white/70 mb-3">Latest reports today</h2>
            <div className="bg-[#161616]/70 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden">
              {data.todayReports.length === 0 ? (
                <p className="text-sm text-white/45 px-4 py-5 text-center">No reports yet today.</p>
              ) : (
                data.todayReports.map((r, i) => {
                  const pill = STATUS_PILL[r.status] || STATUS_PILL.missed;
                  return (
                    <button key={i} onClick={() => navigate('/coach/dashboard', { state: { openAthleteId: r.id, openDate: r.date, athleteName: r.name, groupName: r.group } })}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition ${i > 0 ? 'border-t border-white/5' : ''}`}>
                      <div className="w-9 h-9 rounded-full bg-[#8083ff]/25 border border-[#8083ff]/30 flex items-center justify-center font-bold text-[#c0c1ff] shrink-0">
                        {(r.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">
                          <span className="font-semibold">{r.name}</span>
                          {r.km > 0 && <span className="text-white/60"> · {r.km < 10 ? r.km.toFixed(1) : Math.round(r.km)} km</span>}
                        </p>
                        <span className={`inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${pill.cls}`}>{pill.label}</span>
                      </div>
                      <span className="text-[11px] text-white/40 shrink-0">{timeAgo(r.loggedAt)}</span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Needs attention */}
          {attention.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-white/70 mb-3">Needs attention</h2>
              <div className="grid grid-cols-2 gap-3">
                {attention.map((a) => {
                  const numColor = a.tone === 'red' ? 'text-red-300' : 'text-[#c0c1ff]';
                  const border = a.tone === 'red' ? 'border-red-400/30' : 'border-white/10';
                  return (
                    <button key={a.key} onClick={() => navigate(a.to)}
                      className={`bg-[#161616]/70 backdrop-blur-2xl border ${border} rounded-2xl p-4 text-left hover:bg-white/[0.04] active:scale-[0.98] transition`}>
                      <div className="flex items-start justify-between">
                        <span className={`text-4xl font-black ${numColor}`}>{a.count}</span>
                        <span className={numColor}>{a.icon}</span>
                      </div>
                      <p className="mt-2 text-sm text-white/60">{a.label}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryStat({ value, label }) {
  return (
    <div>
      <p className="text-4xl font-extrabold leading-none text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">{value}</p>
      <p className="text-[11px] uppercase tracking-wider font-semibold text-white/75 mt-1.5 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">{label}</p>
    </div>
  );
}

// Inline icons for the attention cards
const ICON_PERSON_ADD = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M15 19a4 4 0 00-8 0M11 11a3 3 0 100-6 3 3 0 000 6zM18 8v6M21 11h-6" />
  </svg>
);
const ICON_GROUP_ADD = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M9 20H2v-2a4 4 0 018 0M13 7a3 3 0 11-6 0 3 3 0 016 0zM19 5v4M21 7h-4" />
  </svg>
);
