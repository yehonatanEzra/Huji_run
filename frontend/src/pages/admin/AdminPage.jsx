import { useEffect, useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import { listPending, approveRace, rejectRace, approveResult, rejectResult } from '../../api/adminReview';
import { listAllUsers, patchUser, deleteUser } from '../../api/adminUsers';
import { adminListStravaUsers, adminDisconnectStrava, adminDisconnectAllStrava, adminGetStravaStatus, adminBlockAllStrava, adminReleaseStrava, adminEnableAllStrava, adminSetStravaEnabled } from '../../api/strava';

const GLASS = 'bg-[#201f20]/60 backdrop-blur-2xl border border-white/10';
const GLASS_INPUT = 'w-full bg-[#1c1b1c]/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20';
const TAB = 'flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition flex items-center justify-center gap-1.5';
const TAB_ACTIVE = 'bg-[#c0c1ff] text-[#1000a9]';
const TAB_INACTIVE = 'text-white/55 hover:text-white';

function AdminBackground() {
  return (
    <>
      <div className="fixed inset-0 -z-10 bg-[#131314]" />
      <div className="fixed inset-0 -z-10" style={{ background: 'radial-gradient(120% 80% at 50% -10%, rgba(192,193,255,0.10) 0%, rgba(19,19,20,0) 55%)' }} />
    </>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState('review');
  const [pending, setPending] = useState({ races: [], results: [] });

  const refreshPending = useCallback(() => {
    return listPending().then(({ data }) => setPending(data)).catch(() => {});
  }, []);
  useEffect(() => { refreshPending(); }, [refreshPending]);

  const pendingCount = (pending.races?.length || 0) + (pending.results?.length || 0);

  return (
    <>
      <AdminBackground />

      <h2 className="text-xl font-bold text-[#e5e2e3] mb-3">Admin</h2>

      <div className={`flex gap-1 p-1 rounded-full mb-4 ${GLASS}`}>
        <button onClick={() => setTab('review')} className={`${TAB} ${tab === 'review' ? TAB_ACTIVE : TAB_INACTIVE}`}>
          Review
          {pendingCount > 0 && (
            <span className={`text-[10px] font-bold rounded-full px-1.5 py-px ${tab === 'review' ? 'bg-[#1000a9] text-[#c0c1ff]' : 'bg-[#c0c1ff] text-[#1000a9]'}`}>{pendingCount}</span>
          )}
        </button>
        <button onClick={() => setTab('users')} className={`${TAB} ${tab === 'users' ? TAB_ACTIVE : TAB_INACTIVE}`}>Users</button>
        <button onClick={() => setTab('strava')} className={`${TAB} ${tab === 'strava' ? TAB_ACTIVE : TAB_INACTIVE}`}>Strava</button>
      </div>

      {tab === 'review' && <ReviewTab pending={pending} onChanged={refreshPending} />}
      {tab === 'users' && <UsersTab />}
      {tab === 'strava' && <StravaTab />}
    </>
  );
}

// ── Review tab: approve/reject pending races + results ────────────────────────
function ReviewTab({ pending, onChanged }) {
  const [acting, setActing] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null); // { kind, item, note }

  const handleApprove = async (kind, item) => {
    setActing(true);
    try {
      if (kind === 'race') await approveRace(item.id);
      else await approveResult(item.id);
      await onChanged();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not approve');
    } finally { setActing(false); }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    setActing(true);
    try {
      const { kind, item, note } = rejectTarget;
      if (kind === 'race') await rejectRace(item.id, note || null);
      else await rejectResult(item.id, note || null);
      setRejectTarget(null);
      await onChanged();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Could not reject');
    } finally { setActing(false); }
  };

  const empty = pending.races.length === 0 && pending.results.length === 0;

  return (
    <div>
      <p className="text-xs text-white/55 mb-4">
        Approve coach submissions before they go live in the race archive and Hall of Fame.
      </p>

      {empty ? (
        <p className="text-center py-12 text-sm text-white/45">No pending items right now.</p>
      ) : (
        <>
          {pending.races.length > 0 && (
            <section className="mb-6">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#c0c1ff] mb-2">
                Races · {pending.races.length}
              </p>
              <div className="space-y-2">
                {pending.races.map((r) => (
                  <div key={r.id} className={`${GLASS} rounded-xl p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{r.name}</p>
                        <p className="text-xs text-white/50 mt-0.5">
                          {format(new Date(r.race_date + 'T00:00'), 'MMM d, yyyy')} · proposed by {r.proposer_name}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => setRejectTarget({ kind: 'race', item: r, note: '' })} disabled={acting}
                          className="text-xs px-3 py-1.5 rounded-lg border border-white/15 text-white/80 hover:bg-white/10 disabled:opacity-50 transition">Reject</button>
                        <button onClick={() => handleApprove('race', r)} disabled={acting}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[#c0c1ff] text-[#1000a9] font-bold hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition">Approve</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {pending.results.length > 0 && (
            <section>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#c0c1ff] mb-2">
                Results · {pending.results.length}
              </p>
              <div className="space-y-2">
                {pending.results.map((res) => (
                  <div key={res.id} className={`${GLASS} rounded-xl p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{res.athlete_name}</p>
                        <p className="text-sm text-white/90 font-mono mt-0.5">{res.time_display} · {res.distance_m}m</p>
                        <p className="text-xs text-white/50 mt-1">
                          {res.race_name} · {res.heat_label}
                          {res.proposer_name && <> · proposed by {res.proposer_name}</>}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => setRejectTarget({ kind: 'result', item: res, note: '' })} disabled={acting}
                          className="text-xs px-3 py-1.5 rounded-lg border border-white/15 text-white/80 hover:bg-white/10 disabled:opacity-50 transition">Reject</button>
                        <button onClick={() => handleApprove('result', res)} disabled={acting}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[#c0c1ff] text-[#1000a9] font-bold hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition">Approve</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Reject sheet */}
      <Modal open={!!rejectTarget} onClose={() => !acting && setRejectTarget(null)} panelClassName="bg-[#131314] border-t border-white/10">
        {rejectTarget && (
          <div>
            <h3 className="text-base font-bold text-white mb-1">
              Reject {rejectTarget.kind === 'race' ? 'race' : 'result'}?
            </h3>
            <p className="text-sm text-white/55 mb-3">
              The proposer will see your note in their drafts. They can edit and resubmit.
            </p>
            <textarea
              value={rejectTarget.note}
              onChange={(e) => setRejectTarget({ ...rejectTarget, note: e.target.value })}
              placeholder="Reason (optional)"
              rows={3}
              className={`${GLASS_INPUT} mb-4`}
            />
            <div className="flex gap-2">
              <button onClick={() => setRejectTarget(null)} disabled={acting}
                className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/80 font-medium hover:bg-white/5 disabled:opacity-50">Cancel</button>
              <button onClick={submitReject} disabled={acting}
                className="flex-1 py-2.5 rounded-xl bg-red-500/80 hover:bg-red-500 text-white font-bold disabled:opacity-50">{acting ? 'Rejecting…' : 'Reject'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const ROLE_BADGE = {
  athlete: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
  coach: 'bg-blue-500/20 text-blue-200 border-blue-400/30',
  admin: 'bg-[#c0c1ff]/20 text-[#c0c1ff] border-[#c0c1ff]/30',
};

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'athlete', label: 'Athletes' },
  { key: 'coach', label: 'Coaches' },
];

// ── Users tab: list / search / filter / edit / delete ─────────────────────────
function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const fetchUsers = () => {
    setLoading(true);
    listAllUsers()
      .then(({ data }) => { setUsers(data.users); setError(null); })
      .catch((err) => setError(err?.response?.data?.detail || 'Failed to load users'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchUsers(); }, []);

  const adminCount = useMemo(() => (users || []).filter((u) => u.role === 'admin').length, [users]);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== 'all' && u.role !== filter) return false;
      if (!q) return true;
      return u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    });
  }, [users, filter, search]);

  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        {FILTER_OPTIONS.map((opt) => (
          <button key={opt.key} onClick={() => setFilter(opt.key)}
            className={`flex-1 py-1.5 text-sm font-semibold rounded-xl border transition ${
              filter === opt.key
                ? 'bg-[#c0c1ff] text-[#1000a9] border-transparent'
                : 'bg-[#1c1b1c]/60 text-white/60 border-white/10 hover:text-white'
            }`}>{opt.label}</button>
        ))}
      </div>

      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name or username…" className={`${GLASS_INPUT} mb-3`} />

      {error && <p className="text-sm text-red-300 mb-3">{error}</p>}

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-white/45 italic text-center py-8">No matching users</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((u) => (
            <UserRow key={u.id} user={u} isSelf={me?.id === u.id} onEdit={() => setEditing(u)} />
          ))}
        </div>
      )}

      <UserEditModal
        target={editing}
        isSelf={editing && me?.id === editing.id}
        adminCount={adminCount}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); fetchUsers(); }}
      />
    </div>
  );
}

function UserRow({ user, isSelf, onEdit }) {
  const subLine = user.role === 'athlete'
    ? [user.coach_name && `Coached by ${user.coach_name}`, user.training_group_name].filter(Boolean).join(' · ')
    : (user.role === 'coach' || user.role === 'admin')
      ? `${user.athletes_count} ${user.athletes_count === 1 ? 'athlete' : 'athletes'}`
      : '';

  return (
    <div className={`flex items-center gap-3 ${GLASS} rounded-xl px-3 py-2.5`}>
      <div className="w-9 h-9 rounded-full bg-[#c0c1ff]/20 border border-[#c0c1ff]/30 flex items-center justify-center overflow-hidden shrink-0">
        {user.photo_url ? (
          <img src={user.photo_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[#c0c1ff] font-bold">{user.full_name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-medium text-white truncate">{user.full_name}</p>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${ROLE_BADGE[user.role]}`}>{user.role}</span>
          {isSelf && <span className="text-[10px] text-white/40 italic">(you)</span>}
        </div>
        <p className="text-[11px] text-white/50 truncate">@{user.username}{subLine ? ` · ${subLine}` : ''}</p>
      </div>
      <button onClick={onEdit}
        className="text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-2.5 py-1 transition">Edit</button>
    </div>
  );
}

function UserEditModal({ target, isSelf, adminCount, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('athlete');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (target) {
      setName(target.full_name);
      setRole(target.role);
      setErr(null);
      setConfirmDelete(false);
    }
  }, [target]);

  const lastAdminLock = target?.role === 'admin' && adminCount <= 1;

  const save = async (patch) => {
    setBusy(true); setErr(null);
    try {
      await patchUser(target.id, patch);
      onSaved();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Save failed');
    } finally { setBusy(false); }
  };

  const handleRename = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === target.full_name) return;
    save({ full_name: trimmed });
  };

  const handleRoleSave = () => {
    if (role === target.role) return;
    save({ role });
  };

  const handleDelete = async () => {
    setBusy(true); setErr(null);
    try {
      await deleteUser(target.id);
      onSaved();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Delete failed');
      setBusy(false);
    }
  };

  return (
    <Modal open={!!target} onClose={onClose} title={target ? `Edit ${target.full_name}` : ''}
      panelClassName="bg-[#131314] border-t border-white/10">
      {target && (
        <div className="space-y-4 text-white">
          {err && <p className="text-sm text-red-300">{err}</p>}

          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold text-white/55">Name</label>
            <div className="flex gap-2 mt-1">
              <input value={name} onChange={(e) => setName(e.target.value)} className={GLASS_INPUT} />
              <button onClick={handleRename} disabled={busy || !name.trim() || name.trim() === target.full_name}
                className="text-sm font-bold bg-[#c0c1ff] text-[#1000a9] disabled:opacity-40 rounded-xl px-4">Save</button>
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold text-white/55">Role</label>
            <div className="flex gap-2 mt-1">
              <select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf || lastAdminLock}
                className={`${GLASS_INPUT} disabled:opacity-50`}>
                <option value="athlete" className="bg-[#1c1b1c]">Athlete</option>
                <option value="coach" className="bg-[#1c1b1c]">Coach</option>
                <option value="admin" className="bg-[#1c1b1c]">Admin</option>
              </select>
              <button onClick={handleRoleSave} disabled={busy || role === target.role || isSelf || lastAdminLock}
                className="text-sm font-bold bg-[#c0c1ff] text-[#1000a9] disabled:opacity-40 rounded-xl px-4">Save</button>
            </div>
            {(isSelf || lastAdminLock) && (
              <p className="text-[11px] text-white/50 italic mt-1">
                {isSelf ? "You can't change your own role." : "Can't demote the last admin."}
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-white/10">
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} disabled={busy || isSelf || lastAdminLock}
                className="w-full text-sm font-semibold text-red-200 bg-red-500/15 hover:bg-red-500/25 border border-red-400/30 rounded-xl px-3 py-2 disabled:opacity-40">Delete account…</button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-white/85">
                  Permanently delete <strong>{target.full_name}</strong>? All their workout logs,
                  kudos, feed activity, and race results will be wiped. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button onClick={handleDelete} disabled={busy}
                    className="flex-1 text-sm font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl py-2">{busy ? 'Deleting…' : 'Delete forever'}</button>
                  <button onClick={() => setConfirmDelete(false)} disabled={busy}
                    className="flex-1 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl py-2">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Strava tab: manage Strava connections ────────────────────────
function StravaTab() {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(null);
  const [filter, setFilter] = useState('all'); // all | enabled | connected | blocked
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, statusRes] = await Promise.all([
        adminListStravaUsers(),
        adminGetStravaStatus(),
      ]);
      setUsers(usersRes.data || []);
      setStatus(statusRes.data || {});
    } catch (e) {
      console.error('Failed to fetch Strava data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDisconnect = useCallback(async (userId, username) => {
    if (!confirm(`Disconnect Strava for ${username}? This frees their Strava slot and they'll need to fully reconnect.`)) return;
    setDisconnecting(userId);
    try {
      await adminDisconnectStrava(userId);
      setUsers(users.map(u => u.id === userId ? { ...u, strava_connected: false, strava_last_synced_at: null } : u));
    } catch (e) {
      console.error('Failed to disconnect', e);
      alert('Failed to disconnect');
    } finally {
      setDisconnecting(null);
    }
  }, [users]);

  const handleDisconnectAll = useCallback(async () => {
    if (!confirm('Disconnect ALL members from Strava? This deauthorizes every athlete on Strava (freeing all your slots). Everyone will need to reconnect.')) return;
    setDisconnecting('all');
    try {
      const { data } = await adminDisconnectAllStrava();
      setUsers(users.map(u => ({ ...u, strava_connected: false, strava_last_synced_at: null })));
      alert(`Disconnected ${data.processed} member(s). Strava confirmed ${data.deauthorized} slot(s) freed.`);
    } catch (e) {
      console.error('Failed to disconnect all', e);
      alert('Failed to disconnect all');
    } finally {
      setDisconnecting(null);
    }
  }, [users]);

  const handleBlockAll = useCallback(async () => {
    if (!confirm('Block Strava for EVERYONE? This disconnects every connected member (freeing all Strava slots) and locks the connect option for all members and new members until you release it.')) return;
    setDisconnecting('block');
    try {
      const { data } = await adminBlockAllStrava();
      setUsers(users.map(u => ({ ...u, strava_connected: false, strava_enabled: false, strava_last_synced_at: null })));
      setStatus(s => ({ ...s, block_all: true }));
      alert(`Blocked. Disconnected ${data.processed} member(s); Strava confirmed ${data.deauthorized} slot(s) freed.`);
    } catch (e) {
      console.error('Failed to block all', e);
      alert('Failed to block all');
    } finally {
      setDisconnecting(null);
    }
  }, [users]);

  const handleRelease = useCallback(async () => {
    setDisconnecting('release');
    try {
      await adminReleaseStrava();
      setStatus(s => ({ ...s, block_all: false }));
    } catch (e) {
      console.error('Failed to release', e);
      alert('Failed to release');
    } finally {
      setDisconnecting(null);
    }
  }, []);

  const handleEnableAll = useCallback(async () => {
    if (!confirm('Enable Strava for everyone? This lifts the lock and enables every member to connect.')) return;
    setDisconnecting('enable');
    try {
      await adminEnableAllStrava();
      setUsers(users.map(u => ({ ...u, strava_enabled: true })));
      setStatus(s => ({ ...s, block_all: false }));
    } catch (e) {
      console.error('Failed to enable all', e);
      alert('Failed to enable all');
    } finally {
      setDisconnecting(null);
    }
  }, [users]);

  const handleToggleEnabled = useCallback(async (userId, enabled) => {
    setDisconnecting(`toggle-${userId}`);
    try {
      await adminSetStravaEnabled(userId, enabled);
      setUsers(users.map(u => u.id === userId ? { ...u, strava_enabled: enabled } : u));
    } catch (e) {
      console.error('Failed to update access', e);
      alert('Failed to update access');
    } finally {
      setDisconnecting(null);
    }
  }, [users]);

  const connectedCount = users.filter(u => u.strava_connected).length;
  const enabledCount = users.filter(u => u.strava_enabled !== false).length;
  const blockedCount = users.filter(u => u.strava_enabled === false).length;
  const blocked = !!status?.block_all;

  const q = search.trim().toLowerCase();
  const filteredUsers = users.filter(u => {
    if (filter === 'enabled' && u.strava_enabled === false) return false;
    if (filter === 'blocked' && u.strava_enabled !== false) return false;
    if (filter === 'connected' && !u.strava_connected) return false;
    if (q && !(`${u.full_name} ${u.username}`.toLowerCase().includes(q))) return false;
    return true;
  });

  const FILTERS = [
    { key: 'all', label: `All (${users.length})` },
    { key: 'enabled', label: `Enabled (${enabledCount})` },
    { key: 'connected', label: `Connected (${connectedCount})` },
    { key: 'blocked', label: `Blocked (${blockedCount})` },
  ];

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className={`p-3 rounded-lg ${GLASS}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/60 uppercase tracking-wider font-semibold mb-1">Strava Status</p>
            <p className="text-sm">
              {status?.disabled ? (
                <span className="text-red-300">🔴 Strava disabled globally (env)</span>
              ) : blocked ? (
                <span className="text-red-300">🔴 Strava blocked for everyone (rollout locked)</span>
              ) : status?.configured ? (
                <span className="text-green-300">🟢 Strava is configured and enabled</span>
              ) : (
                <span className="text-yellow-300">🟡 Strava not configured</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/60 uppercase tracking-wider font-semibold">Connected Users</p>
            <p className="text-2xl font-bold text-[#c0c1ff]">{connectedCount} / {users.length}</p>
          </div>
        </div>

        {/* Access-control actions */}
        {blocked ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={handleRelease}
              disabled={disconnecting === 'release'}
              className="text-xs font-bold px-3 py-2 rounded-lg border border-white/25 text-white/70 hover:bg-white/10 disabled:opacity-50 transition"
            >
              {disconnecting === 'release' ? 'Releasing…' : 'Release (enable individually)'}
            </button>
            <button
              onClick={handleEnableAll}
              disabled={disconnecting === 'enable'}
              className="text-xs font-bold px-3 py-2 rounded-lg border border-green-400/40 text-green-300 hover:bg-green-500/15 disabled:opacity-50 transition"
            >
              {disconnecting === 'enable' ? 'Enabling…' : 'Enable all (open to everyone)'}
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <button
              onClick={handleBlockAll}
              disabled={disconnecting === 'block'}
              className="w-full text-xs font-bold px-3 py-2 rounded-lg border border-red-400/40 text-red-300 hover:bg-red-500/15 disabled:opacity-50 transition"
            >
              {disconnecting === 'block' ? 'Blocking…' : 'Block all (disconnect everyone & lock)'}
            </button>
            {connectedCount > 0 && (
              <button
                onClick={handleDisconnectAll}
                disabled={disconnecting === 'all'}
                className="w-full text-xs font-bold px-3 py-2 rounded-lg border border-white/25 text-white/60 hover:bg-white/10 disabled:opacity-50 transition"
              >
                {disconnecting === 'all' ? 'Disconnecting all…' : `Disconnect all (${connectedCount}) — free slots, no lock`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filters + search */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition ${filter === f.key ? 'bg-[#c0c1ff] text-[#1000a9] border-transparent' : 'border-white/15 text-white/60 hover:bg-white/10'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          className={GLASS_INPUT}
        />
      </div>

      {/* Users list */}
      <div className={`rounded-lg overflow-hidden ${GLASS}`}>
        {loading ? (
          <div className="p-4 flex items-center justify-center"><Spinner /></div>
        ) : users.length === 0 ? (
          <p className="p-4 text-sm text-white/40">No users found</p>
        ) : filteredUsers.length === 0 ? (
          <p className="p-4 text-sm text-white/40">No matching users</p>
        ) : (
          <div className="divide-y divide-white/10">
            {filteredUsers.map(u => (
              <div key={u.id} className="p-3 flex items-center justify-between hover:bg-white/5 transition">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                    {u.full_name}
                    {u.strava_enabled === false && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">blocked</span>
                    )}
                  </p>
                  <p className="text-xs text-white/60">{u.username} · {u.role}</p>
                  {u.strava_connected && u.strava_last_synced_at && (
                    <p className="text-xs text-green-400/70 mt-0.5">Last synced: {format(new Date(u.strava_last_synced_at), 'MMM d, HH:mm')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <button
                    onClick={() => handleToggleEnabled(u.id, !u.strava_enabled)}
                    disabled={disconnecting === `toggle-${u.id}`}
                    className={`text-xs px-3 py-1.5 rounded border disabled:opacity-50 transition ${u.strava_enabled === false ? 'border-green-400/40 text-green-300 hover:bg-green-500/15' : 'border-white/25 text-white/60 hover:bg-white/10'}`}
                    title={u.strava_enabled === false ? 'Enable Strava for this athlete' : 'Block Strava for this athlete'}
                  >
                    {disconnecting === `toggle-${u.id}` ? '…' : (u.strava_enabled === false ? 'Enable' : 'Disable')}
                  </button>
                  {u.strava_connected ? (
                    <button
                      onClick={() => handleDisconnect(u.id, u.full_name)}
                      disabled={disconnecting === u.id}
                      className="text-xs px-3 py-1.5 rounded border border-red-400/40 text-red-300 hover:bg-red-500/15 disabled:opacity-50 transition"
                    >
                      {disconnecting === u.id ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  ) : (
                    <span className="text-xs text-white/40">Not connected</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
