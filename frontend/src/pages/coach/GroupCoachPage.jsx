import { useState, useEffect } from 'react';
import { listGroups } from '../../api/coach';
import {
  listGroupCoaches,
  searchCoaches,
  addGroupCoach,
  removeGroupCoach,
  transferGroupOwnership,
} from '../../api/groupCoach';
import { useAuth } from '../../contexts/AuthContext';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';

export default function GroupCoachPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Add-coach modal state
  const [addOpen, setAddOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);

  // Transfer modal state
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    listGroups()
      .then(({ data }) => {
        setGroups(data);
        if (data.length > 0) setSelectedGroup(data[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedGroup) return;
    setLoading(true);
    setError('');
    listGroupCoaches(selectedGroup.id)
      .then(({ data }) => setCoaches(data))
      .catch((err) => setError(err.response?.data?.detail || 'Failed to load coaches'))
      .finally(() => setLoading(false));
  }, [selectedGroup]);

  const isMainCoach = coaches.some(
    (c) => c.user_id === user?.id && c.role === 'main'
  );

  // Search for coaches to add
  useEffect(() => {
    if (!searchQ.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      setSearching(true);
      searchCoaches(searchQ)
        .then(({ data }) => {
          const existingIds = new Set(coaches.map((c) => c.user_id));
          setSearchResults(data.filter((u) => !existingIds.has(u.id)));
        })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, coaches]);

  const handleAdd = async (targetUser) => {
    setAddingId(targetUser.id);
    try {
      const { data } = await addGroupCoach(selectedGroup.id, targetUser.id, 'assistant');
      setCoaches((prev) => [...prev, data]);
      setSearchQ('');
      setSearchResults([]);
      setAddOpen(false);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add coach');
    } finally {
      setAddingId(null);
    }
  };

  const handleRemove = async (coachEntry) => {
    if (!confirm(`Remove ${coachEntry.full_name} as assistant coach?`)) return;
    setError('');
    try {
      await removeGroupCoach(selectedGroup.id, coachEntry.user_id);
      setCoaches((prev) => prev.filter((c) => c.user_id !== coachEntry.user_id));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove coach');
    }
  };

  const handleTransfer = async () => {
    if (!transferTarget) return;
    setTransferring(true);
    try {
      await transferGroupOwnership(selectedGroup.id, transferTarget.user_id);
      // Reload coaches to reflect new roles
      const { data } = await listGroupCoaches(selectedGroup.id);
      setCoaches(data);
      setTransferOpen(false);
      setTransferTarget(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to transfer ownership');
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold">Group Coaches</h2>

      {/* Group selector */}
      {groups.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroup(g)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedGroup?.id === g.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {groups.length === 0 && (
        <p className="text-gray-500 text-sm">You have no training groups.</p>
      )}

      {error && (
        <p className="text-red-500 text-sm bg-red-50 rounded p-2">{error}</p>
      )}

      {loading && <Spinner />}

      {selectedGroup && !loading && (
        <>
          <div className="space-y-2">
            {coaches.map((c) => (
              <div key={c.user_id} className="bg-white border rounded-lg px-3 py-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{c.full_name}</p>
                  <p className="text-xs text-gray-400">@{c.username}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  c.role === 'main'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {c.role === 'main' ? 'Main coach' : 'Assistant'}
                </span>
                {isMainCoach && c.role === 'assistant' && (
                  <button
                    onClick={() => handleRemove(c)}
                    className="text-xs text-red-500 hover:text-red-700 ml-1"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}

            {coaches.length === 0 && (
              <p className="text-gray-500 text-sm">No coaches assigned yet.</p>
            )}
          </div>

          {isMainCoach && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAddOpen(true)}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700"
              >
                Add assistant coach
              </button>
              {coaches.filter((c) => c.role === 'assistant').length > 0 && (
                <button
                  onClick={() => setTransferOpen(true)}
                  className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Transfer ownership
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Add coach modal */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); setSearchQ(''); setSearchResults([]); }}>
        <h3 className="font-semibold mb-3">Add assistant coach</h3>
        <input
          type="text"
          placeholder="Search by name…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
          autoFocus
        />
        {searching && <Spinner />}
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {searchResults.map((u) => (
            <div key={u.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{u.full_name}</p>
                <p className="text-xs text-gray-400">@{u.username}</p>
              </div>
              <button
                onClick={() => handleAdd(u)}
                disabled={addingId === u.id}
                className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-full hover:bg-blue-700 disabled:opacity-50"
              >
                {addingId === u.id ? '…' : 'Add'}
              </button>
            </div>
          ))}
          {!searching && searchQ && searchResults.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">No coaches found</p>
          )}
        </div>
      </Modal>

      {/* Transfer ownership modal */}
      <Modal open={transferOpen} onClose={() => { setTransferOpen(false); setTransferTarget(null); }}>
        <h3 className="font-semibold mb-1">Transfer main coach role</h3>
        <p className="text-xs text-gray-500 mb-3">
          You will become an assistant. This cannot be undone without the new main coach's cooperation.
        </p>
        <div className="space-y-1 mb-4">
          {coaches
            .filter((c) => c.role === 'assistant')
            .map((c) => (
              <button
                key={c.user_id}
                onClick={() => setTransferTarget(c)}
                className={`w-full text-left p-2 rounded-lg border transition-colors ${
                  transferTarget?.user_id === c.user_id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium">{c.full_name}</p>
                <p className="text-xs text-gray-400">@{c.username}</p>
              </button>
            ))}
        </div>
        <button
          onClick={handleTransfer}
          disabled={!transferTarget || transferring}
          className="w-full bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {transferring ? 'Transferring…' : 'Confirm transfer'}
        </button>
      </Modal>
    </div>
  );
}
