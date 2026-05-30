import { useState, useEffect } from 'react';
import { listAthletes, updateAthlete, deleteAthlete } from '../../api/coach';
import { removeAthleteFromRoster } from '../../api/coaching';
import { useAuth } from '../../contexts/AuthContext';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  // For admin: hard-delete confirmation modal. For coach: remove-from-roster modal.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [acting, setActing] = useState(false);

  const fetch = () => {
    setLoading(true);
    listAthletes()
      .then(({ data }) => setAthletes(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const startEdit = (athlete) => {
    setEditingId(athlete.id);
    setEditName(athlete.full_name);
  };

  const handleRename = async (id) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updateAthlete(id, editName.trim());
      setEditingId(null);
      fetch();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Could not rename';
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleHardDelete = async () => {
    setActing(true);
    try {
      await deleteAthlete(deleteTarget.id);
      setDeleteTarget(null);
      fetch();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Could not delete';
      alert(msg);
    } finally {
      setActing(false);
    }
  };

  const handleRemoveFromRoster = async () => {
    setActing(true);
    try {
      await removeAthleteFromRoster(removeTarget.id);
      setRemoveTarget(null);
      fetch();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Could not remove';
      alert(msg);
    } finally {
      setActing(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Settings</h2>
      <p className="text-xs text-gray-500 mb-4">
        {isAdmin
          ? 'You can rename or permanently delete any athlete.'
          : 'You can remove athletes from your roster (they keep their data and can re-pair). Renaming and permanent deletion are admin-only.'}
      </p>
      <h3 className="text-base font-semibold mb-3">
        {isAdmin ? 'Members' : 'My athletes'} ({athletes.length})
      </h3>

      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {athletes.map((a) => (
            <div key={a.id} className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 bg-white">
              {editingId === a.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRename(a.id)}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={() => handleRename(a.id)}
                    disabled={saving}
                    className="text-sm text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                  >Save</button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >Cancel</button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.full_name}</p>
                    <p className="text-xs text-gray-400">{a.gender === 'M' ? 'Male' : 'Female'}</p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => startEdit(a)}
                      className="text-sm text-blue-600 hover:underline"
                    >Rename</button>
                  )}
                  {isAdmin ? (
                    <button
                      onClick={() => setDeleteTarget(a)}
                      className="text-sm text-red-500 hover:underline"
                    >Delete</button>
                  ) : (
                    <button
                      onClick={() => setRemoveTarget(a)}
                      className="text-sm text-orange-600 hover:underline"
                    >Remove</button>
                  )}
                </>
              )}
            </div>
          ))}
          {athletes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
              {isAdmin ? 'No members yet' : 'No athletes registered with you yet. Athletes will request to join from the Find Coach page.'}
            </p>
          )}
        </div>
      )}

      {/* Admin hard-delete */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Permanently delete member">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to permanently delete <strong>{deleteTarget.full_name}</strong>? This wipes all their workout logs, targets, race results, and feed activity. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleHardDelete}
                disabled={acting}
                className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >{acting ? 'Deleting…' : 'Delete forever'}</button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Coach remove-from-roster */}
      <Modal open={!!removeTarget} onClose={() => setRemoveTarget(null)} title="Remove from roster">
        {removeTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Remove <strong>{removeTarget.full_name}</strong> from your roster?
              Their data stays intact and they can register with another coach (or yours again).
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRemoveFromRoster}
                disabled={acting}
                className="flex-1 bg-orange-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
              >{acting ? 'Removing…' : 'Remove'}</button>
              <button
                onClick={() => setRemoveTarget(null)}
                className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
