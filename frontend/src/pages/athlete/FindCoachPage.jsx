import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { listCoaches, getMyPairing, requestCoach, withdrawRequest } from '../../api/coaching';
import { useAuth } from '../../contexts/AuthContext';
import { useOutsideClick } from '../../hooks/use-outside-click';
import Spinner from '../../components/ui/Spinner';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

function initials(name) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const GRADIENT_COLORS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-orange-500 to-rose-600',
  'from-sky-500 to-cyan-600',
];

function avatarGradient(id) {
  return GRADIENT_COLORS[id % GRADIENT_COLORS.length];
}

function CloseIcon() {
  return (
    <motion.svg
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.05 } }}
      xmlns="http://www.w3.org/2000/svg"
      width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4 text-white"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </motion.svg>
  );
}

export default function FindCoachPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [coaches, setCoaches] = useState([]);
  const [pairing, setPairing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [active, setActive] = useState(null);

  const cardRef = useRef(null);
  const id = useId();

  useOutsideClick(cardRef, () => setActive(null));

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') setActive(null);
    }
    if (active) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [active]);

  const refresh = async () => {
    setLoading(true);
    try {
      const [cs, p] = await Promise.all([listCoaches(), getMyPairing()]);
      setCoaches(cs.data);
      setPairing(p.data);
      if (p.data.coach_id) {
        navigate('/home', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleRequest = async (coachId) => {
    setActing(true);
    try {
      await requestCoach(coachId);
      await refresh();
      // Keep the card open so athlete can see "Pending…" feedback
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Could not send request';
      alert(msg);
    } finally {
      setActing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!pairing?.pending_request) return;
    if (!confirm('Withdraw your request?')) return;
    setActing(true);
    try {
      await withdrawRequest(pairing.pending_request.id);
      await refresh();
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner /></div>;
  }

  const pending = pairing?.pending_request;

  return (
    <div className="pb-8">
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950" />
      <div className="mb-5 px-1">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-200">Welcome, {user?.full_name}</p>
        <h2 className="text-2xl font-extrabold text-white mt-1 [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">Find your coach</h2>
        <p className="text-sm text-white/65 mt-2">
          Tap a coach to learn more, then send a join request.
        </p>
      </div>

      {pending && (
        <div className="bg-amber-400/15 border border-amber-400/30 backdrop-blur-sm rounded-xl p-4 mb-4">
          <p className="text-xs uppercase tracking-wider text-amber-200 font-semibold mb-1">Request pending</p>
          <p className="text-sm text-white">Waiting for <span className="font-semibold text-amber-100">{pending.coach_name}</span> to accept.</p>
          <button
            onClick={handleWithdraw}
            disabled={acting}
            className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-amber-300/50 text-amber-200 hover:bg-amber-400/10 disabled:opacity-50 transition"
          >
            Withdraw request
          </button>
        </div>
      )}

      {/* Expanded card overlay */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-10"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {active && (
          <div className="fixed inset-0 grid place-items-center z-[100] p-4">
            <motion.div
              layoutId={`coach-card-${active.id}-${id}`}
              ref={cardRef}
              className="relative w-full max-w-[480px] max-h-[90vh] flex flex-col bg-gradient-to-b from-blue-950 to-indigo-950 border border-white/15 rounded-3xl overflow-hidden shadow-2xl"
            >
              {/* Close button — pinned inside the card's top-right */}
              <motion.button
                key={`close-${active.id}-${id}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.05 } }}
                className="absolute top-3 right-3 flex items-center justify-center bg-black/45 backdrop-blur-md border border-white/25 rounded-full h-8 w-8 shadow-md z-10 hover:bg-black/65 transition"
                onClick={() => setActive(null)}
                aria-label="Close"
              >
                <CloseIcon />
              </motion.button>

              {/* Photo or initials hero */}
              <motion.div
                layoutId={`coach-hero-${active.id}-${id}`}
                className="relative shrink-0"
              >
                {active.has_photo ? (
                  <img
                    src={`${API_BASE}/profile/photo/${active.id}`}
                    alt={active.full_name}
                    className="w-full h-56 object-cover object-top"
                  />
                ) : (
                  <div className={`w-full h-56 bg-gradient-to-br ${avatarGradient(active.id)} flex items-center justify-center`}>
                    <span className="text-6xl font-black text-white/90 select-none">
                      {initials(active.full_name)}
                    </span>
                  </div>
                )}
              </motion.div>

              {/* Body */}
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-5 pt-4 pb-2">
                  <motion.h3
                    layoutId={`coach-name-${active.id}-${id}`}
                    className="text-xl font-extrabold text-white"
                  >
                    {active.full_name}
                  </motion.h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-sm text-white/55">@{active.username}</span>
                    <span className="text-xs bg-blue-400/20 text-blue-200 border border-blue-400/30 font-semibold rounded-full px-2 py-0.5">
                      {active.athlete_count} athlete{active.athlete_count === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                {active.bio && (
                  <motion.div
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-5 pt-2 pb-3 flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,white_80%,transparent)]"
                  >
                    <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{active.bio}</p>
                  </motion.div>
                )}

                {/* Request button */}
                <div className="px-5 pb-5 pt-3 shrink-0">
                  {(() => {
                    const isPendingThis = pending && pending.coach_id === active.id;
                    const isDisabled = acting || (!!pending && !isPendingThis);
                    return (
                      <button
                        onClick={() => !isPendingThis && handleRequest(active.id)}
                        disabled={isDisabled}
                        className={`w-full py-3 rounded-2xl text-sm font-bold transition ${
                          isPendingThis
                            ? 'bg-amber-400/20 text-amber-200 border border-amber-300/30 cursor-default'
                            : isDisabled
                            ? 'bg-white/10 text-white/35 cursor-not-allowed'
                            : 'bg-green-500 hover:bg-green-400 text-white shadow-md'
                        }`}
                      >
                        {isPendingThis ? 'Request sent — waiting for approval' : 'Request to join'}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Coach list */}
      {coaches.length === 0 ? (
        <div className="text-center py-12 text-sm text-white/55">
          No coaches available yet. Check back soon.
        </div>
      ) : (
        <ul className="space-y-2">
          {coaches.map((c) => {
            const isPendingThis = pending && pending.coach_id === c.id;
            return (
              <motion.li
                layoutId={`coach-card-${c.id}-${id}`}
                key={`coach-card-${c.id}-${id}`}
                onClick={() => setActive(c)}
                className="bg-black/40 backdrop-blur-sm rounded-2xl border border-white/15 p-4 flex items-center gap-4 cursor-pointer hover:bg-black/55 hover:border-white/30 transition"
              >
                {/* Avatar */}
                <motion.div
                  layoutId={`coach-hero-${c.id}-${id}`}
                  className="shrink-0"
                >
                  {c.has_photo ? (
                    <img
                      src={`${API_BASE}/profile/photo/${c.id}`}
                      alt={c.full_name}
                      className="w-14 h-14 rounded-full object-cover object-top border-2 border-white/30"
                    />
                  ) : (
                    <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${avatarGradient(c.id)} flex items-center justify-center`}>
                      <span className="text-lg font-black text-white/90 select-none">{initials(c.full_name)}</span>
                    </div>
                  )}
                </motion.div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <motion.p
                    layoutId={`coach-name-${c.id}-${id}`}
                    className="font-bold text-white truncate"
                  >
                    {c.full_name}
                  </motion.p>
                  <p className="text-xs text-white/55 mt-0.5">
                    {c.athlete_count} athlete{c.athlete_count === 1 ? '' : 's'} · @{c.username}
                  </p>
                </div>

                {/* Status indicator */}
                <div className="shrink-0 text-right">
                  {isPendingThis ? (
                    <span className="text-xs bg-amber-400/20 text-amber-200 border border-amber-300/30 font-semibold rounded-full px-2.5 py-1">Pending</span>
                  ) : (
                    <span className="text-white/35 text-lg">›</span>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 bg-white/8 backdrop-blur-sm rounded-xl border border-white/15 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/55 mb-2">What you can do meanwhile</p>
        <ul className="text-sm text-white/80 space-y-1 list-disc pl-5 marker:text-white/40">
          <li>Log your own workouts in the Training tab</li>
          <li>Browse races and the Hall of Fame</li>
          <li>See health &amp; wellness contacts</li>
          <li>Edit your profile</li>
        </ul>
      </div>
    </div>
  );
}
