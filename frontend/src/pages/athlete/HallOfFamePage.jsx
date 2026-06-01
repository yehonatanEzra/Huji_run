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

function FilterPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition ${
        active
          ? 'bg-white text-black border-white'
          : 'bg-white/10 backdrop-blur-sm border-white/20 text-white/70 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function GlassCard({ children, className = '' }) {
  return (
    <div className={`bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl p-4 ${className}`}>
      {children}
    </div>
  );
}

function MedalRow({ children }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/10">
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

      <div className="flex gap-2 mb-4">
        {['men', 'women'].map(g => (
          <button
            key={g}
            onClick={() => setGender(g)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition capitalize ${
              gender === g
                ? 'bg-white text-black border-white'
                : 'bg-white/10 backdrop-blur-sm border-white/25 text-white/65 hover:text-white'
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
                className="min-w-[85%] snap-start bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl p-4 flex-shrink-0"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">{title}</h3>
                    <p className="text-[11px] text-white/50 mt-0.5">{sub}</p>
                  </div>
                  {tabMatchesUserGender && (
                    <span className="text-xs font-bold text-amber-300 [text-shadow:0_1px_4px_rgba(0,0,0,0.5)] shrink-0">
                      Your rank: {myRank ? `#${myRank}` : '--'}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {entries.map((e) => (
                    <MedalRow key={e.rank}>
                      <span className="text-2xl">{MEDAL[e.rank - 1] || `#${e.rank}`}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-white truncate">{e.athlete_name}</p>
                      </div>
                      <span className="font-bold text-sm text-blue-200">{e.total_km} km</span>
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
              <div
                key={dist.distance_m}
                className="min-w-[85%] snap-start flex-shrink-0 bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-3 gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    {DISTANCE_LABELS[dist.distance_m] || `${dist.distance_m}m`}
                  </h3>
                  {tabMatchesGender && (
                    <span className="text-xs font-bold text-amber-300 [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
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
                          <p className="font-medium text-sm text-white truncate">{e.athlete_name}</p>
                          <p className="text-xs text-white/50">{e.achieved_date}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold text-sm text-white">{e.time_display}</p>
                          <p className="text-xs text-white/50">{e.pace_display} /km</p>
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
            className="bg-white text-black px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-white/80 transition active:scale-95"
          >+ Challenge</button>
        )}
      </div>

      {loading ? <Spinner /> : challenges.length === 0 ? (
        <p className="text-center text-white/50 italic py-8">No challenges yet</p>
      ) : (
        <div className="space-y-3">
          {challenges.map(ch => (
            <div key={ch.id} className="bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl overflow-hidden">
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
                    <p className="text-xs text-blue-200 mt-2 font-medium">
                      Your rank: #{detail.my_rank}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Challenge">
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Challenge name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setForm({ ...form, challenge_type: 'total_km' })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                form.challenge_type === 'total_km' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >Total KM</button>
            <button
              onClick={() => setForm({ ...form, challenge_type: 'best_time' })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                form.challenge_type === 'best_time' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'
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
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          {form.challenge_type === 'best_time' && (
            <select
              value={form.target_distance_m}
              onChange={e => setForm({ ...form, target_distance_m: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select distance</option>
              {Object.entries(DISTANCE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Start date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">End date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <select
            value={form.training_group_id}
            onChange={e => setForm({ ...form, training_group_id: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All athletes</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={saving || !form.name.trim() || !form.start_date || !form.end_date}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
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

  return (
    <div>
      <PageBackground src="/bg-hof.jpg" />

      {/* Title — springs in on mount, stays forever */}
      <motion.div
        initial={{ opacity: 0, scale: 0.75, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.34, 1.56, 0.64, 1] }}
        className="text-center pt-2 pb-2"
      >
        <h2
          className="text-5xl font-black uppercase tracking-wide leading-none"
          style={{
            background: 'linear-gradient(135deg, #fde68a, #f59e0b, #fbbf24, #d97706)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 18px rgba(251,191,36,0.65))',
          }}
        >
          Hall of Fame
        </h2>
        <p className="text-[11px] tracking-[0.25em] uppercase text-amber-200 mt-3 [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
          🏆 &nbsp; Where legends are made &nbsp; 🏆
        </p>

        {/* Small section toggle — sits right under the title */}
        <div className="flex justify-center gap-2 mt-4">
          {['records', 'challenges'].map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition capitalize ${
                section === s
                  ? 'bg-amber-400/90 text-black border-amber-400'
                  : 'bg-white/10 backdrop-blur-sm border-white/25 text-white/65 hover:text-white'
              }`}
            >
              {s === 'records' ? '🥇 Records' : '⚡ Challenges'}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Spacer — photo breathes here */}
      <div className="h-[22vh]" />
      {section === 'records' ? <RecordsView /> : <ChallengesView />}
    </div>
  );
}
