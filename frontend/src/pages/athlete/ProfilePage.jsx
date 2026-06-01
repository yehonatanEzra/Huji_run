import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getMyProfile, uploadPhoto, updateMyProfile } from '../../api/profile';
import { getMyPairing, leaveCoach } from '../../api/coaching';
import { getStravaConnectUrl, disconnectStrava } from '../../api/strava';
import Spinner from '../../components/ui/Spinner';
import PageBackground from '../../components/PageBackground';

const DISTANCE_LABELS = {
  1500: '1,500m', 3000: '3,000m', 5000: '5,000m',
  10000: '10,000m', 21100: 'Half Marathon', 42200: 'Marathon',
};

const GLASS_CARD = 'bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl p-4';
const SECTION_LABEL = 'text-[10px] uppercase tracking-widest text-white/55 font-semibold';
const GLASS_INPUT = 'w-full bg-white/10 border border-white/25 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40';

export default function ProfilePage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [stravaConnecting, setStravaConnecting] = useState(false);
  const [stravaDisconnecting, setStravaDisconnecting] = useState(false);
  const [stravaMsg, setStravaMsg] = useState('');
  const [pairing, setPairing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const fileRef = useRef();
  const isAthlete = user?.role === 'athlete';
  const isCoach = user?.role === 'coach' || user?.role === 'admin';

  const fetchProfile = () =>
    getMyProfile()
      .then(({ data }) => setProfile(data))
      .catch(console.error)
      .finally(() => setLoading(false));

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

  const handleSaveBio = async () => {
    setSavingBio(true);
    try {
      const { data } = await updateMyProfile({ bio: bioInput });
      setProfile(prev => ({ ...prev, bio: data.bio }));
      setEditingBio(false);
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not save bio');
    } finally {
      setSavingBio(false);
    }
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      const { data } = await updateMyProfile({ full_name: nameInput.trim() });
      setProfile(prev => ({ ...prev, full_name: data.full_name }));
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      stored.full_name = data.full_name;
      localStorage.setItem('user', JSON.stringify(stored));
      login({ access_token: localStorage.getItem('token'), ...stored });
      setEditingName(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingName(false);
    }
  };

  // Detect return from Strava OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('strava');
    if (status === 'connected') {
      setStravaMsg('✓ Strava connected successfully!');
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      stored.strava_connected = true;
      localStorage.setItem('user', JSON.stringify(stored));
      login({ access_token: localStorage.getItem('token'), ...stored });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (status === 'error') {
      setStravaMsg('Could not connect Strava. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnectStrava = async () => {
    setStravaConnecting(true);
    try {
      const { data } = await getStravaConnectUrl();
      window.location.href = data.url;
    } catch (err) {
      setStravaMsg(err?.response?.data?.detail || 'Could not start Strava connection');
      setStravaConnecting(false);
    }
  };

  const handleDisconnectStrava = async () => {
    if (!confirm('Disconnect Strava? Your activity history in the app will no longer update.')) return;
    setStravaDisconnecting(true);
    try {
      await disconnectStrava();
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      stored.strava_connected = false;
      localStorage.setItem('user', JSON.stringify(stored));
      login({ access_token: localStorage.getItem('token'), ...stored });
      setStravaMsg('');
    } catch (err) {
      setStravaMsg(err?.response?.data?.detail || 'Could not disconnect Strava');
    } finally {
      setStravaDisconnecting(false);
    }
  };

  if (loading) return <Spinner />;
  if (!profile) return <p className="text-center text-white/60">Failed to load profile</p>;

  const photoSrc = profile.photo_url ? profile.photo_url + '?t=' + Date.now() : null;
  const roleLabel = isCoach ? 'Coach' : profile.gender === 'M' ? 'Male athlete' : 'Female athlete';

  return (
    <div>
      <PageBackground src={profile.gender === 'F' ? '/bg-profile-f.jpg' : '/bg-profile-m.jpg'} />

      {/* Hero — avatar + name centred, photo shows above */}
      <div className="flex flex-col items-center text-center pt-[22vh] pb-6">
        <div className="relative mb-3">
          {photoSrc ? (
            <img
              src={photoSrc}
              alt={profile.full_name}
              className="w-20 h-20 rounded-full object-cover border-2 border-white/50 shadow-lg"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/40 flex items-center justify-center text-3xl font-bold text-white shadow-lg">
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 bg-white text-black rounded-full text-xs flex items-center justify-center hover:bg-white/80 transition shadow"
          >
            {uploading ? '…' : '📷'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoChange}
            className="hidden"
          />
        </div>

        {editingName ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); }}
              className="bg-white/15 border border-white/30 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 text-center"
              autoFocus
            />
            <button
              onClick={handleSaveName}
              disabled={savingName}
              className="text-xs bg-white text-black rounded-lg px-3 py-1.5 font-semibold hover:bg-white/80 disabled:opacity-50"
            >Save</button>
            <button
              onClick={() => setEditingName(false)}
              className="text-xs text-white/60 hover:text-white"
            >Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">{profile.full_name}</h2>
            <button
              onClick={() => { setNameInput(profile.full_name); setEditingName(true); }}
              className="text-xs text-white/55 hover:text-white transition"
            >✏️</button>
          </div>
        )}
        <p className="text-sm text-white/60 mt-0.5 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">{roleLabel}</p>
      </div>

      {/* About me */}
      <div className={`${GLASS_CARD} mb-4`}>
        <div className="flex items-center justify-between mb-2">
          <p className={SECTION_LABEL}>About me</p>
          {!editingBio && (
            <button
              onClick={() => { setBioInput(profile.bio || ''); setEditingBio(true); }}
              className="text-xs text-white/55 hover:text-white transition"
            >{profile.bio ? 'Edit' : '+ Add'}</button>
          )}
        </div>
        {editingBio ? (
          <>
            <textarea
              value={bioInput}
              onChange={(e) => setBioInput(e.target.value.slice(0, 500))}
              rows={4}
              placeholder={isCoach
                ? 'Tell athletes about your coaching style, experience, training philosophy…'
                : 'Tell others about yourself — favorite distance, goals, anything.'}
              className={GLASS_INPUT}
              autoFocus
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-white/40">{bioInput.length}/500</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingBio(false)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/25 text-white/70 hover:text-white transition"
                >Cancel</button>
                <button
                  onClick={handleSaveBio}
                  disabled={savingBio}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white text-black font-semibold hover:bg-white/80 disabled:opacity-50 transition"
                >{savingBio ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </>
        ) : profile.bio ? (
          <p className="text-sm text-white/85 whitespace-pre-wrap">{profile.bio}</p>
        ) : (
          <p className="text-sm text-white/40 italic">
            {isCoach ? 'No bio yet. Add one so athletes can learn about you.' : 'No bio yet.'}
          </p>
        )}
      </div>

      {/* Strava connection — athletes only */}
      {isAthlete && (
      <div className={`${GLASS_CARD} mb-4`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={SECTION_LABEL}>Strava</p>
            {stravaMsg && (
              <p className={`text-xs mt-1 ${stravaMsg.startsWith('✓') ? 'text-green-300' : 'text-red-300'}`}>
                {stravaMsg}
              </p>
            )}
          </div>
          {user?.strava_connected ? (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <span className="text-xs font-semibold text-orange-300 bg-orange-400/20 border border-orange-400/30 px-2.5 py-1 rounded-full">
                🏃 Connected
              </span>
              <button
                onClick={handleDisconnectStrava}
                disabled={stravaDisconnecting}
                className="text-xs text-red-300 hover:text-red-200 border border-red-400/30 px-2.5 py-1 rounded-full transition disabled:opacity-50"
              >
                {stravaDisconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectStrava}
              disabled={stravaConnecting}
              className="text-xs font-semibold bg-orange-500/80 hover:bg-orange-500 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {stravaConnecting ? 'Redirecting…' : '🏃 Connect Strava'}
            </button>
          )}
        </div>
      </div>
      )}

      {/* My coach */}
      {isAthlete && (
        <div className={`${GLASS_CARD} mb-4`}>
          <p className={`${SECTION_LABEL} mb-2`}>My coach</p>
          {pairing?.coach_id ? (
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-white">{pairing.coach_name}</p>
              <button
                onClick={handleLeaveCoach}
                disabled={leaving}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-400/40 text-red-300 hover:bg-red-400/15 disabled:opacity-50 transition"
              >
                {leaving ? 'Leaving…' : 'Leave'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/50 italic">Not registered</p>
              <button
                onClick={() => navigate('/find-coach')}
                className="text-xs px-3 py-1.5 rounded-lg bg-white text-black font-semibold hover:bg-white/80 transition"
              >
                Find a coach
              </button>
            </div>
          )}
        </div>
      )}

      {/* Personal Bests + Race History (athletes only) */}
      {!isCoach && (
        <>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white/70 mb-3 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
            Personal Bests
          </h3>
          {profile.personal_bests.length === 0 ? (
            <p className="text-sm text-white/40 italic mb-6">No records yet</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {profile.personal_bests.map((pb) => (
                <div key={pb.distance_m} className="bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl p-3">
                  <p className="text-[11px] text-white/55 font-medium uppercase tracking-wide">{DISTANCE_LABELS[pb.distance_m]}</p>
                  <p className="text-xl font-mono font-bold text-blue-200 mt-0.5">{pb.time_display}</p>
                  <p className="text-xs text-white/50">{pb.pace_display} /km</p>
                  <p className="text-[11px] text-white/40 mt-1 truncate">{pb.race_name} · {pb.achieved_date}</p>
                </div>
              ))}
            </div>
          )}

          <h3 className="text-sm font-bold uppercase tracking-wider text-white/70 mb-3 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
            Race History
          </h3>
          {profile.race_history.length === 0 ? (
            <p className="text-sm text-white/40 italic">No races yet</p>
          ) : (
            <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/10">
                    <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-white/50">Race</th>
                    <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-white/50">Dist</th>
                    <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-white/50">Time</th>
                    <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-white/50">#</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.race_history.map((r, i) => (
                    <tr key={i} className="border-t border-white/10">
                      <td className="px-3 py-2">
                        <p className="font-medium text-white truncate max-w-[110px]">{r.race_name}</p>
                        <p className="text-xs text-white/45">{r.race_date}</p>
                      </td>
                      <td className="px-3 py-2 text-white/65 text-xs">{DISTANCE_LABELS[r.distance_m] || `${r.distance_m}m`}</td>
                      <td className="px-3 py-2 text-right font-mono text-white/85">{r.time_display}</td>
                      <td className="px-3 py-2 text-right text-white/65">{r.placement}</td>
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
