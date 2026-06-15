import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { getPublicTeam } from '../api/teams';
import Spinner from '../components/ui/Spinner';

const DISTANCE_LABELS = {
  1500: '1,500m', 3000: '3,000m', 5000: '5,000m',
  10000: '10,000m', 21100: 'Half Marathon', 42200: 'Marathon',
};
const distLabel = (m) => DISTANCE_LABELS[m] || `${m}m`;
const GLASS = 'bg-[#161616]/70 backdrop-blur-2xl border border-white/10';

export default function PublicTeamPage() {
  const { teamId } = useParams();
  const [team, setTeam] = useState(undefined); // undefined=loading, null=not found
  const [error, setError] = useState(false);

  useEffect(() => {
    getPublicTeam(teamId)
      .then(({ data }) => setTeam(data))
      .catch(() => { setTeam(null); setError(true); });
  }, [teamId]);

  return (
    <div className="min-h-dvh text-white">
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.55) 0%, rgba(0,0,0,0.7) 100%)' }} />

      {/* Minimal header */}
      <header className="sticky top-0 z-10 bg-black/40 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Huji Run</h1>
        <Link to="/login" className="text-xs font-medium bg-white/10 hover:bg-white/20 rounded-full px-3 py-1 transition">Log in</Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-16">
        {team === undefined ? (
          <div className="flex justify-center py-24"><Spinner /></div>
        ) : team === null ? (
          <div className="text-center py-24">
            <p className="text-4xl mb-3">🔒</p>
            <p className="text-white/70">This team profile is private or doesn't exist.</p>
          </div>
        ) : (
          <>
            {/* Team header */}
            <div className={`${GLASS} rounded-2xl p-5 mb-6`}>
              <h2 className="text-2xl font-black text-[#c0c1ff] [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">{team.name}</h2>
              <p className="text-xs text-white/55 mt-1">
                {[team.sport, team.location].filter(Boolean).join(' · ')}
              </p>
              {team.description && <p className="text-sm text-white/75 mt-3 whitespace-pre-wrap">{team.description}</p>}
            </div>

            {/* Hall of Fame */}
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/45 mb-2">Hall of Fame</h3>
            {team.hall_of_fame.length === 0 ? (
              <p className={`${GLASS} rounded-2xl px-4 py-5 text-sm text-white/45 text-center mb-6`}>No records yet.</p>
            ) : (
              <div className="space-y-2 mb-6">
                {team.hall_of_fame.map((d) => (
                  <div key={d.distance_m} className={`${GLASS} rounded-2xl p-4`}>
                    <p className="text-sm font-bold text-white mb-2">{distLabel(d.distance_m)}</p>
                    <div className="grid grid-cols-2 gap-4">
                      <HofColumn title="Men" entries={d.men} />
                      <HofColumn title="Women" entries={d.women} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent results */}
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/45 mb-2">Recent results</h3>
            {team.recent_results.length === 0 ? (
              <p className={`${GLASS} rounded-2xl px-4 py-5 text-sm text-white/45 text-center mb-6`}>No verified results yet.</p>
            ) : (
              <div className={`${GLASS} rounded-2xl overflow-hidden mb-8`}>
                {team.recent_results.map((r, i) => (
                  <div key={i} className={`flex items-center justify-between gap-3 px-4 py-3 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{r.athlete_name}</p>
                      <p className="text-[11px] text-white/50">{r.race_name} · {format(new Date(r.race_date + 'T00:00'), 'MMM d, yyyy')}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-bold text-[#c0c1ff]">{r.time_display}</p>
                      <p className="text-[10px] text-white/45">{distLabel(r.distance_m)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Join CTA */}
            <Link
              to="/register"
              className="block text-center w-full bg-[#c0c1ff] text-[#1000a9] rounded-2xl py-3.5 text-sm font-bold hover:bg-[#a9aaff] active:scale-[0.99] transition"
            >
              Join this team
            </Link>
          </>
        )}
      </main>
    </div>
  );
}

function HofColumn({ title, entries }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">{title}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-white/30 italic">—</p>
      ) : (
        <div className="space-y-1">
          {entries.map((e) => (
            <div key={e.rank} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-white/70 truncate">{e.rank}. {e.athlete_name}</span>
              <span className="font-mono font-semibold text-white shrink-0">{e.time_display}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
