import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getHallOfFame, getHofGroups, getKmLeaders } from '../../api/leaderboard';
import { getChallenges, getChallenge, createChallenge, deleteChallenge } from '../../api/challenges';
import { listGroups } from '../../api/coach';
import Tabs from '../../components/ui/Tabs';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

const DISTANCE_LABELS = {
  1500: '1,500m',
  3000: '3,000m',
  5000: '5,000m',
  10000: '10,000m',
  21100: 'Half Marathon',
  42200: 'Marathon',
};

const MEDAL = ['🥇', '🥈', '🥉'];

function RecordsView() {
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
          <button
            onClick={() => setSelectedGroup(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              selectedGroup === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >Overall</button>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroup(g.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                selectedGroup === g.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >{g.name}</button>
          ))}
        </div>
      )}

      <Tabs
        tabs={[{ value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }]}
        active={gender}
        onChange={setGender}
      />

      {kmLeaders && (kmLeaders.weekly.length > 0 || kmLeaders.monthly.length > 0) && (
        <div className="space-y-4 mb-6">
          {[
            { title: `Weekly km (${kmLeaders.week_start})`, entries: kmLeaders.weekly },
            { title: `Monthly km (${kmLeaders.month})`, entries: kmLeaders.monthly },
          ].map(({ title, entries }) => entries.length > 0 && (
            <div key={title} className="bg-white rounded-xl border p-4">
              <h3 className="text-sm font-semibold text-gray-600 mb-3">{title}</h3>
              <div className="space-y-2">
                {entries.map((e) => (
                  <div key={e.rank} className="flex items-center gap-3 p-2 rounded-lg bg-blue-50">
                    <span className="text-2xl">{MEDAL[e.rank - 1] || `#${e.rank}`}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{e.athlete_name}</p>
                    </div>
                    <span className="font-bold text-sm text-blue-800">{e.total_km} km</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? <Spinner /> : !data ? (
        <p className="text-center text-gray-500">Failed to load</p>
      ) : (
        <div className="space-y-6">
          {data.map((dist) => {
            const entries = gender === 'men' ? dist.men : dist.women;
            return (
              <div key={dist.distance_m} className="bg-white rounded-xl border p-4">
                <h3 className="text-sm font-semibold text-gray-600 mb-3">
                  {DISTANCE_LABELS[dist.distance_m] || `${dist.distance_m}m`}
                </h3>
                {entries.length === 0 ? (
                  <p className="text-sm text-gray-400">No records yet</p>
                ) : (
                  <div className="space-y-2">
                    {entries.map((e) => (
                      <div key={e.rank} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                        <span className="text-2xl">{MEDAL[e.rank - 1]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{e.athlete_name}</p>
                          <p className="text-xs text-gray-500">{e.achieved_date}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold text-sm">{e.time_display}</p>
                          <p className="text-xs text-gray-500">{e.pace_display} /km</p>
                        </div>
                      </div>
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
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-2">
          {['active', 'past', 'all'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                filter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >{s}</button>
          ))}
        </div>
        {isCoach && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700"
          >+ Challenge</button>
        )}
      </div>

      {loading ? <Spinner /> : challenges.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No challenges yet</p>
      ) : (
        <div className="space-y-3">
          {challenges.map(ch => (
            <div key={ch.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleExpand(ch.id)}
                className="w-full text-left p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-sm">{ch.name}</h3>
                  <div className="flex items-center gap-2">
                    {isCoach && (
                      <span
                        onClick={(e) => { e.stopPropagation(); handleDelete(ch.id); }}
                        className="text-gray-300 hover:text-red-500 text-lg cursor-pointer"
                      >×</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      ch.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {ch.is_active ? `${ch.days_remaining}d left` : 'Ended'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className={`px-1.5 py-0.5 rounded ${
                    ch.challenge_type === 'total_km' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                  }`}>
                    {ch.challenge_type === 'total_km' ? 'Total KM' : 'Best Time'}
                  </span>
                  {ch.target_km && <span>Goal: {ch.target_km} km</span>}
                </div>
              </button>

              {expanded === ch.id && detail && (
                <div className="border-t px-4 pb-4 pt-3">
                  {ch.description && (
                    <p className="text-sm text-gray-600 mb-3">{ch.description}</p>
                  )}
                  {detail.leaderboard.length === 0 ? (
                    <p className="text-sm text-gray-400">No entries yet</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.leaderboard.map(e => (
                        <div key={e.rank} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                          <span className="text-xl">{MEDAL[e.rank - 1] || `#${e.rank}`}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{e.athlete_name}</p>
                          </div>
                          <span className="font-bold text-sm">{e.value_display}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {detail.my_rank && (
                    <p className="text-xs text-blue-600 mt-2 font-medium">
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
      <h2 className="text-xl font-bold mb-4">Hall of Fame</h2>
      <Tabs
        tabs={[
          { value: 'records', label: 'Records' },
          { value: 'challenges', label: 'Challenges' },
        ]}
        active={section}
        onChange={setSection}
      />
      {section === 'records' ? <RecordsView /> : <ChallengesView />}
    </div>
  );
}
