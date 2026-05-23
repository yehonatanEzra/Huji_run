import { useState, useEffect } from 'react';
import { listAthletes, updateAthlete, deleteAthlete } from '../../api/coach';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';

export default function SettingsPage() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

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
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAthlete(deleteTarget.id);
      setDeleteTarget(null);
      fetch();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Settings</h2>
      <h3 className="text-base font-semibold mb-3">Members ({athletes.length})</h3>

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
                  <button
                    onClick={() => startEdit(a)}
                    className="text-sm text-blue-600 hover:underline"
                  >Rename</button>
                  <button
                    onClick={() => setDeleteTarget(a)}
                    className="text-sm text-red-500 hover:underline"
                  >Remove</button>
                </>
              )}
            </div>
          ))}
          {athletes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No members yet</p>
          )}
        </div>
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove Member">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to remove <strong>{deleteTarget.full_name}</strong>? This will delete all their workout logs and targets.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >{deleting ? 'Removing...' : 'Remove'}</button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
