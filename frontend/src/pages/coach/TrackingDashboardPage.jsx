import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, subWeeks, addWeeks } from 'date-fns';
import { getDashboardWeek } from '../../api/coach';
import Spinner from '../../components/ui/Spinner';

export default function TrackingDashboardPage() {
  const [weekDate, setWeekDate] = useState(new Date());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDashboardWeek(format(weekDate, 'yyyy-MM-dd'))
      .then(({ data }) => setData(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [weekDate]);

  const ws = startOfWeek(weekDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Team Tracking</h2>

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekDate(subWeeks(weekDate, 1))} className="text-blue-600 text-sm">&larr; Prev</button>
        <span className="text-sm font-medium">
          {format(ws, 'MMM d')} - {format(addDays(ws, 6), 'MMM d')}
        </span>
        <button onClick={() => setWeekDate(addWeeks(weekDate, 1))} className="text-blue-600 text-sm">Next &rarr;</button>
      </div>

      {loading ? <Spinner /> : !data ? (
        <p className="text-gray-500">Failed to load</p>
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-2 py-2 text-left text-gray-500 font-medium sticky left-0 bg-gray-50 min-w-[120px]">Athlete</th>
                {weekDays.map((d) => (
                  <th key={format(d, 'yyyy-MM-dd')} className="px-2 py-2 text-center text-gray-500 font-medium min-w-[48px]">
                    {format(d, 'EEE')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.athletes.map((athlete) => (
                <tr key={athlete.id} className="border-t">
                  <td className="px-2 py-2 font-medium sticky left-0 bg-white truncate max-w-[120px]">
                    {athlete.full_name}
                  </td>
                  {athlete.days.map((d) => {
                    const log = d.log;
                    let bg = 'bg-gray-100';
                    let text = '-';
                    if (log) {
                      bg = log.completed ? 'bg-green-100' : 'bg-red-100';
                      text = log.completed ? 'V' : 'X';
                    }
                    return (
                      <td key={d.date} className="px-2 py-2 text-center" title={log?.notes || ''}>
                        <span className={`inline-block w-7 h-7 rounded-full ${bg} leading-7 font-bold text-xs`}>
                          {text}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
