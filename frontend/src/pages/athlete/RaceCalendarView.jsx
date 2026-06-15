import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays, addMonths, subMonths, isSameMonth } from 'date-fns';
import { listRaces, listMyRaces } from '../../api/races';
import { useAuth } from '../../contexts/AuthContext';
import Spinner from '../../components/ui/Spinner';

const SCOPE_LABEL = { global: 'Global', group: 'Group', personal: 'Personal' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function RaceCalendarView() {
  const { user } = useAuth();
  const isCoach = user?.role === 'coach' || user?.role === 'admin';
  const [data, setData] = useState(null); // { my: [...], global: [...] }
  const [scope, setScope] = useState('global'); // 'my' | 'global' (athletes only)
  const [monthDate, setMonthDate] = useState(new Date());

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
      setData({
        my: myList.map((r) => ({ ...r, registered: true })),
        global: allList.filter((r) => r.scope === 'global').map((r) => ({ ...r, registered: myIds.has(r.id) })),
      });
    });
    return () => { alive = false; };
  }, []);

  if (data === null) return <div className="flex justify-center py-16"><Spinner /></div>;

  const races = (!isCoach && scope === 'my') ? data.my : data.global;

  // date -> [race]
  const byDate = {};
  races.forEach((r) => { (byDate[r.race_date] ||= []).push(r); });

  // Calendar weeks covering the visible month.
  const calStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 });
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(calStart, w * 7 + i)));
  }
  const lastDay = weeks[5][6];
  if (lastDay < endOfMonth(monthDate)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(calStart, 42 + i)));

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const monthRaces = races
    .filter((r) => isSameMonth(new Date(r.race_date + 'T00:00'), monthDate))
    .sort((a, b) => a.race_date.localeCompare(b.race_date));

  return (
    <div>
      {/* My / Global scope toggle — athletes only */}
      {!isCoach && (
        <div className="flex gap-1.5 mb-3">
          {[['my', 'My'], ['global', 'Global']].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setScope(k)}
              className={`px-4 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border transition ${
                scope === k ? 'bg-[#c0c1ff] text-[#1000a9] border-transparent' : 'bg-[#1c1b1c]/50 border-white/5 text-white/55 hover:text-white'
              }`}
            >{label}</button>
          ))}
        </div>
      )}

      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setMonthDate(subMonths(monthDate, 1))} className="text-white hover:text-white/80 text-sm transition">&larr; Prev</button>
        <span className="text-sm font-semibold text-white">{format(monthDate, 'MMMM yyyy')}</span>
        <button onClick={() => setMonthDate(addMonths(monthDate, 1))} className="text-white hover:text-white/80 text-sm transition">Next &rarr;</button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-white/40">{d}</div>
        ))}
      </div>

      {/* Month grid */}
      <div className="space-y-1 mb-6">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((d) => {
              const key = format(d, 'yyyy-MM-dd');
              const inMonth = isSameMonth(d, monthDate);
              const isToday = key === todayStr;
              const dayRaces = byDate[key] || [];
              const hasRace = dayRaces.length > 0;
              return (
                <div
                  key={key}
                  className={`flex flex-col items-center justify-start py-1.5 rounded-xl text-xs min-h-[3rem] border backdrop-blur-2xl ${
                    !inMonth ? 'opacity-40 border-white/5 bg-black/40' :
                    hasRace ? 'border-2 border-[#8083ff]/80 bg-[#8083ff]/55 shadow-lg shadow-[#8083ff]/20' :
                    isToday ? 'border-[#c0c1ff]/40 bg-[#c0c1ff]/15' : 'border-white/10 bg-black/55'
                  }`}
                >
                  <span className={`font-semibold ${isToday ? 'text-[#c0c1ff]' : 'text-white'}`}>{format(d, 'd')}</span>
                  {hasRace && (
                    <span className="mt-1 text-[9px] leading-none">🏁{dayRaces.length > 1 ? ` ${dayRaces.length}` : ''}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* This month's races */}
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/45 mb-2">
        {format(monthDate, 'MMMM')} races
      </h3>
      {monthRaces.length === 0 ? (
        <p className="text-center text-white/45 py-6 text-sm">No races this month.</p>
      ) : (
        <div className="space-y-2">
          {monthRaces.map((r) => (
            <Link
              key={r.id}
              to={`/races/${r.id}`}
              className="block rounded-2xl p-4 backdrop-blur-2xl border border-white/10 bg-[#161616]/80 transition hover:brightness-125 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm text-white truncate [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">{r.name || '(untitled)'}</p>
                    {r.registered && <span className="text-[10px] bg-[#8083ff]/25 text-[#c0c1ff] font-semibold rounded-full px-2 py-0.5 border border-[#8083ff]/30">Registered</span>}
                  </div>
                  <p className="text-xs text-white/60 mt-0.5">
                    {format(new Date(r.race_date + 'T00:00'), 'EEE, MMM d')} · {SCOPE_LABEL[r.scope] || r.scope}
                  </p>
                </div>
                <span className="text-xs bg-white/20 text-white font-medium rounded-full px-2 py-0.5 whitespace-nowrap border border-white/25">
                  {r.registration_count} registered
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
