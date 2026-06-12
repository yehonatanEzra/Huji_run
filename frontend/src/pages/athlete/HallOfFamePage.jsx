import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../../contexts/AuthContext';
import { getHallOfFame, getHofGroups, getKmLeaders } from '../../api/leaderboard';
import { getChallenges, getChallenge, createChallenge, deleteChallenge } from '../../api/challenges';
import { listGroups } from '../../api/coach';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import PageBackground from '../../components/PageBackground';

const DISTANCE_LABELS = {
  1500: '1,500m',
  3000: '3,000m',
  5000: '5,000m',
  10000: '10,000m',
  21100: 'Half Marathon',
  42200: 'Marathon',
};

const MEDAL = ['🥇', '🥈', '🥉'];

const TAB = 'flex-1 py-2 text-sm font-semibold transition';
const TAB_ACTIVE = 'bg-white text-black';
const TAB_INACTIVE = 'text-white/60 hover:text-white';
const TAB_ROW = 'flex rounded-xl overflow-hidden mb-4 bg-white/10 backdrop-blur-sm border border-white/20';

const GLASS = { background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' };
const DARK_INPUT = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20';

function FilterPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap border transition ${
        active
          ? 'bg-[#c0c1ff] text-[#1000a9] border-transparent'
          : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function GlassCard({ children, className = '' }) {
  return (
    <div style={GLASS} className={`border border-white/10 rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}

function MedalRow({ children }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
      {children}
    </div>
  );
}

function RecordsView() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [gender, setGender] = useState('men');
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [kmLeaders, setKmLeaders] = useState(null);

  useEffect(() => {
    getHofGroups()
      .then(({ data }) => setGroups(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    getHallOfFame(selectedGroup)
      .then(({ data }) => setData(data.distances))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedGroup]);

  useEffect(() => {
    const genderCode = gender === 'men' ? 'M' : 'F';
    getKmLeaders(selectedGroup, genderCode)
      .then(({ data }) => setKmLeaders(data))
      .catch(console.error);
  }, [selectedGroup, gender]);

  return (
    <>
      {groups.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-2">
          <FilterPill active={selectedGroup === null} onClick={() => setSelectedGroup(null)}>Overall</FilterPill>
          {groups.map((g) => (
            <FilterPill key={g.id} active={selectedGroup === g.id} onClick={() => setSelectedGroup(g.id)}>
              {g.name}
            </FilterPill>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {['men', 'women'].map(g => (
          <button
            key={g}
            onClick={() => setGender(g)}
            style={gender === g ? undefined : GLASS}
            className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition active:scale-95 ${
              gender === g
                ? 'bg-[#e5e2e3] text-[#131314]'
                : 'border border-white/10 text-white/60 hover:text-white'
            }`}
          >{g}</button>
        ))}
      </div>

      {kmLeaders && (kmLeaders.weekly.length > 0 || kmLeaders.monthly.length > 0) && (() => {
        const tabMatchesUserGender = user?.gender && (
          (user.gender === 'M' && gender === 'men') ||
          (user.gender === 'F' && gender === 'women')
        );
        return (
        <div className="mb-6">
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
            {[
              { title: `Weekly km`, sub: kmLeaders.week_start, entries: kmLeaders.weekly, myRank: kmLeaders.my_weekly_rank },
              { title: `Monthly km`, sub: kmLeaders.month, entries: kmLeaders.monthly, myRank: kmLeaders.my_monthly_rank },
            ].filter(({ entries }) => entries.length > 0).map(({ title, sub, entries, myRank }) => (
              <div
                key={title}
                style={GLASS}
                className="min-w-[85%] snap-start border border-white/10 rounded-2xl p-5 flex-shrink-0"
              >
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold uppercase tracking-wide text-[#e5e2e3]">{title}</h3>
                    <p className="text-[11px] text-white/50 mt-0.5">{sub}</p>
                  </div>
                  {tabMatchesUserGender && (
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#ffb690] shrink-0">
                      Your rank: {myRank ? `#${myRank}` : '--'}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {entries.slice(0, 3).map((e) => (
                    <MedalRow key={e.rank}>
                      <span className="text-2xl">{MEDAL[e.rank - 1] || `#${e.rank}`}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-white truncate">{e.athlete_name}</p>
                      </div>
                      <span className="font-bold text-base text-[#c0c1ff]">{e.total_km} <span className="text-xs">km</span></span>
                    </MedalRow>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        );
      })()}

      {loading ? <Spinner /> : !data ? (
        <p className="text-center text-white/50 py-6">Failed to load</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
          {data.map((dist) => {
            const entries = (gender === 'men' ? dist.men : dist.women).slice(0, 3);
            // The "Your rank" line appears in the tab matching the user's own
            // gender — a man has no rank in the women's list, and vice versa.
            const tabMatchesGender = user?.gender && (
              (user.gender === 'M' && gender === 'men') ||
              (user.gender === 'F' && gender === 'women')
            );
            return (
              <div key={dist.distance_m} style={GLASS} className="min-w-[85%] snap-start flex-shrink-0 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4 gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-white/70">
                    {DISTANCE_LABELS[dist.distance_m] || `${dist.distance_m}m`}
                  </h3>
                  {tabMatchesGender && (
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#ffb690]">
                      Your rank: {dist.my_rank ? `#${dist.my_rank}` : '--'}
                    </span>
                  )}
                </div>
                {entries.length === 0 ? (
                  <p className="text-sm text-white/40 italic">No records yet</p>
                ) : (
                  <div className="space-y-2">
                    {entries.map((e) => (
                      <MedalRow key={e.rank}>
                        <span className="text-2xl">{MEDAL[e.rank - 1]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-white truncate">{e.athlete_name}</p>
                          <p className="text-xs text-white/40">{e.achieved_date}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-base text-white">{e.time_display}</p>
                          <p className="text-[10px] text-white/40 uppercase">{e.pace_display} /km</p>
                        </div>
                      </MedalRow>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ChallengesView() {
  const { user } = useAuth();
  const isCoach = user?.role === 'coach' || user?.role === 'admin';
  const [filter, setFilter] = useState('active');
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({
    name: '', description: '', challenge_type: 'total_km',
    target_km: '', target_distance_m: '', start_date: '', end_date: '',
    training_group_id: '',
  });
  const [saving, setSaving] = useState(false);

  const fetchChallenges = async () => {
    setLoading(true);
    try {
      const { data } = await getChallenges(filter);
      setChallenges(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchChallenges(); }, [filter]);

  useEffect(() => {
    if (isCoach) {
      listGroups().then(r => setGroups(r.data)).catch(() => {});
    }
  }, [isCoach]);

  const toggleExpand = async (id) => {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    try {
      const { data } = await getChallenge(id);
      setDetail(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.start_date || !form.end_date) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        challenge_type: form.challenge_type,
        start_date: form.start_date,
        end_date: form.end_date,
      };
      if (form.challenge_type === 'total_km' && form.target_km) {
        payload.target_km = parseFloat(form.target_km);
      }
      if (form.challenge_type === 'best_time' && form.target_distance_m) {
        payload.target_distance_m = parseInt(form.target_distance_m);
      }
      if (form.training_group_id) {
        payload.training_group_id = parseInt(form.training_group_id);
      }
      await createChallenge(payload);
      setShowCreate(false);
      setForm({ name: '', description: '', challenge_type: 'total_km', target_km: '', target_distance_m: '', start_date: '', end_date: '', training_group_id: '' });
      fetchChallenges();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteChallenge(id);
      setChallenges(prev => prev.filter(c => c.id !== id));
      if (expanded === id) { setExpanded(null); setDetail(null); }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {['active', 'past', 'all'].map(s => (
            <FilterPill key={s} active={filter === s} onClick={() => setFilter(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </FilterPill>
          ))}
        </div>
        {isCoach && (
          <button
            onClick={() => setShowCreate(true)}
            style={{ boxShadow: '0 0 15px rgba(192,193,255,0.3)' }}
            className="bg-[#c0c1ff] text-[#1000a9] px-4 py-1.5 rounded-full text-sm font-bold hover:scale-[1.02] active:scale-95 transition"
          >+ Challenge</button>
        )}
      </div>

      {loading ? <Spinner /> : challenges.length === 0 ? (
        <p className="text-center text-white/50 italic py-8">No challenges yet</p>
      ) : (
        <div className="space-y-3">
          {challenges.map(ch => (
            <div key={ch.id} style={GLASS} className="border border-white/10 rounded-2xl overflow-hidden">
              <button
                onClick={() => toggleExpand(ch.id)}
                className="w-full text-left p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-sm text-white">{ch.name}</h3>
                  <div className="flex items-center gap-2">
                    {isCoach && (
                      <span
                        onClick={(e) => { e.stopPropagation(); handleDelete(ch.id); }}
                        className="text-white/25 hover:text-red-400 text-lg cursor-pointer transition"
                      >×</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      ch.is_active
                        ? 'bg-green-400/15 text-green-200 border-green-400/30'
                        : 'bg-white/10 text-white/40 border-white/15'
                    }`}>
                      {ch.is_active ? `${ch.days_remaining}d left` : 'Ended'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span className={`px-1.5 py-0.5 rounded border ${
                    ch.challenge_type === 'total_km'
                      ? 'bg-blue-400/15 text-blue-200 border-blue-400/25'
                      : 'bg-purple-400/15 text-purple-200 border-purple-400/25'
                  }`}>
                    {ch.challenge_type === 'total_km' ? 'Total KM' : 'Best Time'}
                  </span>
                  {ch.target_km && <span>Goal: {ch.target_km} km</span>}
                </div>
              </button>

              {expanded === ch.id && detail && (
                <div className="border-t border-white/15 px-4 pb-4 pt-3">
                  {ch.description && (
                    <p className="text-sm text-white/70 mb-3">{ch.description}</p>
                  )}
                  {detail.leaderboard.length === 0 ? (
                    <p className="text-sm text-white/40 italic">No entries yet</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.leaderboard.map(e => (
                        <MedalRow key={e.rank}>
                          <span className="text-xl">{MEDAL[e.rank - 1] || `#${e.rank}`}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-white truncate">{e.athlete_name}</p>
                          </div>
                          <span className="font-bold text-sm text-white">{e.value_display}</span>
                        </MedalRow>
                      ))}
                    </div>
                  )}
                  {detail.my_rank && (
                    <p className="text-xs text-[#c0c1ff] mt-2 font-medium">
                      Your rank: #{detail.my_rank}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Challenge"
        panelClassName="bg-[#131314] border-t border-white/10">
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Challenge name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className={DARK_INPUT}
          />
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            rows={2}
            className={`${DARK_INPUT} resize-none`}
          />
          <div className="flex gap-2">
            <button
              onClick={() => setForm({ ...form, challenge_type: 'total_km' })}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition ${
                form.challenge_type === 'total_km' ? 'bg-[#c0c1ff] text-[#1000a9] border-transparent' : 'bg-white/5 text-white/60 border-white/10'
              }`}
            >Total KM</button>
            <button
              onClick={() => setForm({ ...form, challenge_type: 'best_time' })}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition ${
                form.challenge_type === 'best_time' ? 'bg-[#a078ff] text-white border-transparent' : 'bg-white/5 text-white/60 border-white/10'
              }`}
            >Best Time</button>
          </div>
          {form.challenge_type === 'total_km' && (
            <input
              type="number"
              step="1"
              placeholder="Target km (optional goal)"
              value={form.target_km}
              onChange={e => setForm({ ...form, target_km: e.target.value })}
              className={DARK_INPUT}
            />
          )}
          {form.challenge_type === 'best_time' && (
            <select
              value={form.target_distance_m}
              onChange={e => setForm({ ...form, target_distance_m: e.target.value })}
              className={DARK_INPUT}
            >
              <option value="" className="bg-[#1c1b1c]">Select distance</option>
              {Object.entries(DISTANCE_LABELS).map(([val, label]) => (
                <option key={val} value={val} className="bg-[#1c1b1c]">{label}</option>
              ))}
            </select>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-white/50">Start date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className={DARK_INPUT}
              />
            </div>
            <div>
              <label className="text-xs text-white/50">End date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                className={DARK_INPUT}
              />
            </div>
          </div>
          <select
            value={form.training_group_id}
            onChange={e => setForm({ ...form, training_group_id: e.target.value })}
            className={DARK_INPUT}
          >
            <option value="" className="bg-[#1c1b1c]">All athletes</option>
            {groups.map(g => (
              <option key={g.id} value={g.id} className="bg-[#1c1b1c]">{g.name}</option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={saving || !form.name.trim() || !form.start_date || !form.end_date}
            style={{ boxShadow: '0 0 20px rgba(192,193,255,0.3)' }}
            className="w-full bg-[#c0c1ff] text-[#1000a9] rounded-full py-3 text-sm font-bold hover:scale-[1.01] active:scale-95 disabled:opacity-40 transition"
          >
            {saving ? 'Creating...' : 'Create Challenge'}
          </button>
        </div>
      </Modal>
    </>
  );
}

export default function HallOfFamePage() {
  const [section, setSection] = useState('records');
  // Bumps on an interval to remount the title and replay the blur-reveal.
  const [titleTick, setTitleTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTitleTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <PageBackground src="/bg-hof.jpg" />

      {/* Records / Challenges pill toggle — pinned top-left */}
      <div className="flex justify-start -mt-1 -ml-1 mb-1">
        <div className="flex rounded-full p-0.5 border border-white/5" style={GLASS}>
          {['records', 'challenges'].map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`px-3 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition ${
                section === s ? 'bg-[#c0c1ff] text-[#1000a9]' : 'text-white/50 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Title — letters blur-reveal one by one; keying the wrapper on titleTick
          remounts both lines together so the animation replays on an interval. */}
      <div key={titleTick} className="text-center pt-4 pb-2">
        <motion.h2
          className="text-4xl font-bold uppercase italic tracking-tight text-[#FFD700]"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.045, delayChildren: 0.1 } } }}
        >
          {'Hall of Fame'.split('').map((ch, i) => (
            <motion.span
              key={i}
              className="inline-block"
              style={{ whiteSpace: 'pre' }}
              variants={{
                hidden: { opacity: 0, y: 26, filter: 'blur(8px)' },
                visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
              }}
            >
              {ch}
            </motion.span>
          ))}
        </motion.h2>
        <motion.p
          className="text-[11px] tracking-[0.25em] uppercase text-white/50 mt-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.6 }}
        >
          🏆 &nbsp; Where legends are made &nbsp; 🏆
        </motion.p>
      </div>

      {/* Spacer — photo breathes here */}
      <div className="h-[18vh]" />
      {section === 'records' ? <RecordsView /> : <ChallengesView />}
    </div>
  );
}
