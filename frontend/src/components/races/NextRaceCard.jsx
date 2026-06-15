import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, differenceInCalendarDays } from 'date-fns';
import { listRaces, listMyRaces } from '../../api/races';

const SCOPE_LABEL = { global: 'Global', group: 'Group', personal: 'Personal' };

// Compact "next race" peek for the home pages. Shows the soonest upcoming race
// the viewer is registered for, or any global race. Renders nothing if none.
export default function NextRaceCard({ className = '' }) {
  const [race, setRace] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      listMyRaces({ status: 'upcoming' }),
      listRaces({ status: 'upcoming' }),
    ]).then(([mine, all]) => {
      if (!alive) return;
      const myList = mine.status === 'fulfilled' ? (mine.value.data || []) : [];
      const allList = all.status === 'fulfilled' ? (all.value.data || []) : [];
      const myIds = new Set(myList.map((r) => r.id));
      const byId = new Map();
      myList.forEach((r) => byId.set(r.id, { ...r, registered: true }));
      allList.filter((r) => r.scope === 'global').forEach((r) => {
        if (!byId.has(r.id)) byId.set(r.id, { ...r, registered: myIds.has(r.id) });
      });
      const today = format(new Date(), 'yyyy-MM-dd');
      const upcoming = [...byId.values()]
        .filter((r) => r.race_date >= today)
        .sort((a, b) => a.race_date.localeCompare(b.race_date));
      setRace(upcoming[0] || null);
    }).catch(() => { if (alive) setRace(null); });
    return () => { alive = false; };
  }, []);

  if (!race) return null;

  const days = differenceInCalendarDays(new Date(race.race_date + 'T00:00'), new Date());
  const when = days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;

  return (
    <Link
      to={`/races/${race.id}`}
      className={`block rounded-2xl p-4 bg-[#161616]/70 backdrop-blur-2xl border border-[#8083ff]/25 hover:brightness-125 active:scale-[0.99] transition ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#c0c1ff] mb-0.5">🏁 Next race</p>
          <p className="font-bold text-white truncate">{race.name || '(untitled)'}</p>
          <p className="text-xs text-white/55 mt-0.5">
            {format(new Date(race.race_date + 'T00:00'), 'EEE, MMM d')} · {SCOPE_LABEL[race.scope] || race.scope}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-[#c0c1ff] whitespace-nowrap">{when}</p>
          {race.registered && (
            <span className="inline-block mt-1 text-[10px] bg-[#8083ff]/25 text-[#c0c1ff] font-semibold rounded-full px-2 py-0.5 border border-[#8083ff]/30">
              Registered
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
