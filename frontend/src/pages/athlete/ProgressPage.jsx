import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Spinner from '../../components/ui/Spinner';

const PerformanceGraphs = lazy(() => import('../../components/PerformanceGraphs'));

export default function ProgressPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="pb-8">
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950" />

      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate('/calendar')}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white text-sm font-semibold px-3 py-1.5 rounded-xl transition active:scale-95"
        >
          <span className="text-base leading-none">‹</span> Training log
        </button>
        <h2 className="text-xl font-bold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.7)]">My progress</h2>
        <div className="w-[88px]" />{/* spacer to balance the back button */}
      </div>

      {user?.id ? (
        <Suspense fallback={<div className="py-10 flex justify-center"><Spinner /></div>}>
          <PerformanceGraphs athleteId={user.id} />
        </Suspense>
      ) : (
        <div className="py-10 flex justify-center"><Spinner /></div>
      )}
    </div>
  );
}
