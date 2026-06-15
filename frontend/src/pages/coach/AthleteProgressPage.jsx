import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Spinner from '../../components/ui/Spinner';
import { getAthleteProfile } from '../../api/coach';
import GoalsPanel from '../../components/goals/GoalsPanel';

const PerformanceGraphs = lazy(() => import('../../components/PerformanceGraphs'));

export default function AthleteProgressPage() {
  const { athleteId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const idNum = Number(athleteId);

  const initialName = location.state?.athleteName || '';
  const [athleteName, setAthleteName] = useState(initialName);

  useEffect(() => {
    if (initialName || !idNum) return;
    let cancelled = false;
    getAthleteProfile(idNum)
      .then(({ data }) => { if (!cancelled) setAthleteName(data.full_name || ''); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [idNum, initialName]);

  return (
    <div className="pb-8">
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />

      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white text-sm font-semibold px-3 py-1.5 rounded-xl transition active:scale-95"
        >
          <span className="text-base leading-none">‹</span> Back
        </button>
        <div className="text-center">
          <h2 className="text-xl font-bold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.7)] leading-tight">Progress</h2>
          {athleteName && (
            <p className="text-xs text-white/70 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">{athleteName}</p>
          )}
        </div>
        <div className="w-[64px]" />
      </div>

      {idNum ? (
        <>
          <div className="mb-6">
            <GoalsPanel athleteId={idNum} canEdit />
          </div>
          <Suspense fallback={<div className="py-10 flex justify-center"><Spinner /></div>}>
            <PerformanceGraphs athleteId={idNum} />
          </Suspense>
        </>
      ) : (
        <div className="py-10 flex justify-center"><Spinner /></div>
      )}
    </div>
  );
}
