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
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.7) 0%, rgba(19,19,20,0.95) 100%)' }} />

      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/calendar')}
          className="flex items-center gap-1.5 text-white/80 text-sm font-medium px-4 py-2 rounded-xl border border-white/10 active:scale-95 transition"
          style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        >
          <span className="text-base leading-none">‹</span> Training log
        </button>
        <h2 className="text-2xl font-bold text-[#e5e2e3]">My progress</h2>
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
