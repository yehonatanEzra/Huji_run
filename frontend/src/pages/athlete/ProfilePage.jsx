import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getMyProfile, uploadPhoto, updateMyProfile } from '../../api/profile';
import Spinner from '../../components/ui/Spinner';

const DISTANCE_LABELS = {
  1500: '1,500m', 3000: '3,000m', 5000: '5,000m',
  10000: '10,000m', 21100: 'Half Marathon', 42200: 'Marathon',
};

export default function ProfilePage() {
  const { user, login } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const fileRef = useRef();

  const fetchProfile = () => {
    getMyProfile()
      .then(({ data }) => setProfile(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProfile(); }, []);

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
