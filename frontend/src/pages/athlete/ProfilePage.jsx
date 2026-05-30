import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getMyProfile, uploadPhoto, updateMyProfile } from '../../api/profile';
import { getMyPairing, leaveCoach } from '../../api/coaching';
import Spinner from '../../components/ui/Spinner';

const DISTANCE_LABELS = {
  1500: '1,500m', 3000: '3,000m', 5000: '5,000m',
  10000: '10,000m', 21100: 'Half Marathon', 42200: 'Marathon',
};

export default function ProfilePage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [pairing, setPairing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const fileRef = useRef();
  const isAthlete = user?.role === 'athlete';

  const fetchProfile = () => {
    getMyProfile()
      .then(({ data }) => setProfile(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProfile(); }, []);

  useEffect(() => {
    if (!isAthlete) return;
    getMyPairing().then(({ data }) => setPairing(data)).catch(() => {});
  }, [isAthlete]);

  const handleLeaveCoach = async () => {
    if (!confirm('Leave your coach? Your past data stays. You can join another coach afterwards.')) return;
    setLeaving(true);
    try {
      await leaveCoach();
      // Patch local user object so the rest of the app knows we're unpaired.
      const updated = { ...user, coach_id: null, training_group_id: null };
      localStorage.setItem('user', JSON.stringify(updated));
      navigate('/find-coach');
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not leave coach');
    } finally {
      setLeaving(false);
    }
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadPhoto(file);
      fetchProfile();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      const { data } = await updateMyProfile({ full_name: nameInput.trim() });
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      stored.full_name = data.full_name;
      localStorage.setItem('user', JSON.stringify(stored));
      login({ access_token: localStorage.getItem('token'), ...stored });
      setEditingName(false);
      fetchProfile();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingName(false);
    }
  };

  if (loading) return <Spinner />;
  if (!profile) return <p className="text-center text-gray-500">Failed to load profile</p>;

  const photoSrc = profile.photo_url ? profile.photo_url + '?t=' + Date.now() : null;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          {photoSrc ? (
            <img
              src={photoSrc}
              alt={profile.full_name}
              className="w-16 h-16 rounded-full object-cover border-2 border-blue-200"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600">
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-blue-700"
          >
            {uploading ? '...' : '📷'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoChange}
            className="hidden"
          />
        </div>
        <div>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); }}
                className="border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={handleSaveName}
                disabled={savingName}
                className="text-sm text-white bg-blue-600 rounded-lg px-2 py-1 hover:bg-blue-700 disabled:opacity-50"
              >Save</button>
              <button
                onClick={() => setEditingName(false)}
                className="text-sm text-gray-500"
              >Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{profile.full_name}</h2>
              <button
                onClick={() => { setNameInput(profile.full_name); setEditingName(true); }}
                className="text-xs text-blue-600 hover:underline"
              >Edit</button>
            </div>
          )}
          <span className="text-sm text-gray-500">
            {(user?.role === 'coach' || user?.role === 'admin') ? 'Coach' : profile.gender === 'M' ? 'Male' : 'Female'}
          </span>
        </div>
      </div>

      {isAthlete && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">My coach</p>
          {pairing?.coach_id ? (
            <div className="flex items-center justify-between mt-1">
              <p className="text-base font-semibold text-gray-900">{pairing.coach_name}</p>
              <button
                onClick={handleLeaveCoach}
                disabled={leaving}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {leaving ? 'Leaving…' : 'Leave'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between mt-1">
              <p className="text-base text-gray-500 italic">Not registered</p>
              <button
                onClick={() => navigate('/find-coach')}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
              >
                Find a coach
              </button>
            </div>
          )}
        </div>
      )}

      {user?.role !== 'coach' && user?.role !== 'admin' && (
        <>
          <h3 className="text-base font-semibold mb-3">Personal Bests</h3>
          {profile.personal_bests.length === 0 ? (
            <p className="text-sm text-gray-400 mb-6">No records yet</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {profile.personal_bests.map((pb) => (
                <div key={pb.distance_m} className="bg-white border rounded-xl p-3">
                  <p className="text-xs text-gray-500 font-medium">{DISTANCE_LABELS[pb.distance_m]}</p>
                  <p className="text-lg font-mono font-bold text-blue-700">{pb.time_display}</p>
                  <p className="text-xs text-gray-400">{pb.pace_display} /km</p>
                  <p className="text-xs text-gray-400 mt-1">{pb.race_name} - {pb.achieved_date}</p>
                </div>
              ))}
            </div>
          )}

          <h3 className="text-base font-semibold mb-3">Race History</h3>
          {profile.race_history.length === 0 ? (
            <p className="text-sm text-gray-400">No races yet</p>
          ) : (
            <div className="bg-white border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Race</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Dist</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Time</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">#</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.race_history.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">
                        <p className="font-medium">{r.race_name}</p>
                        <p className="text-xs text-gray-400">{r.race_date}</p>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{DISTANCE_LABELS[r.distance_m] || `${r.distance_m}m`}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.time_display}</td>
                      <td className="px-3 py-2 text-right">{r.placement}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
