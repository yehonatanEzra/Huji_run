import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import { listAllUsers, patchUser, deleteUser } from '../../api/adminUsers';

const ROLE_BADGE = {
  athlete: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
  coach: 'bg-blue-500/20 text-blue-200 border-blue-400/30',
  admin: 'bg-purple-500/20 text-purple-200 border-purple-400/30',
};

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'athlete', label: 'Athletes' },
  { key: 'coach', label: 'Coaches' },
];

export default function UsersPage() {
  const navigate = useNavigate();
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

  const adminCount = useMemo(
    () => (users || []).filter(u => u.role === 'admin').length,
    [users],
  );

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== 'all' && u.role !== filter) return false;
      if (!q) return true;
      return (
        u.full_name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
      );
    });
  }, [users, filter, search]);

  return (
    <div className="pb-8">
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950" />

      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white text-sm font-semibold px-3 py-1.5 rounded-xl transition active:scale-95"
        >
          <span className="text-base leading-none">‹</span> Back
        </button>
        <h2 className="text-xl font-bold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.7)]">Users</h2>
        <div className="w-[64px]" />
      </div>

      <div className="flex gap-2 mb-3">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`flex-1 py-1.5 text-sm font-semibold rounded-xl border transition ${
              filter === opt.key
                ? 'bg-blue-600 text-white border-blue-400/40'
                : 'bg-white/10 text-white/65 border-white/20 hover:bg-white/15'
            }`}
          >{opt.label}</button>
        ))}
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name or username…"
        className="w-full mb-3 bg-white/10 border border-white/20 placeholder-white/40 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      />

      {error && <p className="text-sm text-red-300 mb-3">{error}</p>}

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-white/50 italic text-center py-8">No matching users</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isSelf={me?.id === u.id}
              onEdit={() => setEditing(u)}
            />
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
    : user.role === 'coach' || user.role === 'admin'
      ? `${user.athletes_count} ${user.athletes_count === 1 ? 'athlete' : 'athletes'}`
      : '';

  return (
    <div className="flex items-center gap-3 bg-white/10 border border-white/15 rounded-lg px-3 py-2.5">
      <div className="w-9 h-9 rounded-full bg-blue-500/25 border border-blue-300/40 flex items-center justify-center overflow-hidden shrink-0">
        {user.photo_url ? (
          <img src={user.photo_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-blue-100 font-bold">{user.full_name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-medium text-white truncate">{user.full_name}</p>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${ROLE_BADGE[user.role]}`}>
            {user.role}
          </span>
          {isSelf && <span className="text-[10px] text-white/40 italic">(you)</span>}
        </div>
        <p className="text-[11px] text-white/55 truncate">@{user.username}{subLine ? ` · ${subLine}` : ''}</p>
      </div>
      <button
        onClick={onEdit}
        className="text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-2.5 py-1 transition"
      >
        Edit
      </button>
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
    <Modal
      open={!!target}
      onClose={onClose}
      title={target ? `Edit ${target.full_name}` : ''}
      panelClassName="bg-gradient-to-b from-blue-950 to-indigo-950 border-t border-white/10"
    >
      {target && (
        <div className="space-y-4 text-white">
          {err && <p className="text-sm text-red-300">{err}</p>}

          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold text-white/55">Name</label>
            <div className="flex gap-2 mt-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <button
                onClick={handleRename}
                disabled={busy || !name.trim() || name.trim() === target.full_name}
                className="text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg px-3"
              >Save</button>
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold text-white/55">Role</label>
            <div className="flex gap-2 mt-1">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={isSelf || lastAdminLock}
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50"
              >
                <option value="athlete" className="text-black">Athlete</option>
                <option value="coach" className="text-black">Coach</option>
                <option value="admin" className="text-black">Admin</option>
              </select>
              <button
                onClick={handleRoleSave}
                disabled={busy || role === target.role || isSelf || lastAdminLock}
                className="text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg px-3"
              >Save</button>
            </div>
            {(isSelf || lastAdminLock) && (
              <p className="text-[11px] text-white/50 italic mt-1">
                {isSelf ? "You can't change your own role." : "Can't demote the last admin."}
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-white/10">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={busy || isSelf || lastAdminLock}
                className="w-full text-sm font-semibold text-red-200 bg-red-500/15 hover:bg-red-500/25 border border-red-400/30 rounded-lg px-3 py-2 disabled:opacity-40"
              >Delete account…</button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-white/85">
                  Permanently delete <strong>{target.full_name}</strong>?
                  All their workout logs, kudos, feed activity, and race
                  results will be wiped. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={busy}
                    className="flex-1 text-sm font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg py-2"
                  >{busy ? 'Deleting…' : 'Delete forever'}</button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy}
                    className="flex-1 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg py-2"
                  >Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
