import { useState, useEffect } from 'react';
import {
  listTemplates, getTemplate, deleteTemplate,
} from '../../api/workoutTemplates';
import Spinner from '../../components/ui/Spinner';
import TemplateBuilder, { AthleteApplyModal } from './PlanBuilder';

// The coach-level Plans page = private/general plans. Apply targets a specific
// athlete. Group plans live in the Group hub's "Plan" tab.
export default function WorkoutTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // template detail being edited, or 'new'
  const [applyTarget, setApplyTarget] = useState(null); // template to apply

  const refresh = () => {
    setLoading(true);
    listTemplates()
      .then(({ data }) => setTemplates(data.filter((t) => !t.group_id)))  // general only
      .catch((err) => setError(err.response?.data?.detail || 'Failed to load templates'))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const openNew = () => setEditing({ id: null, name: '', description: '', weeks_count: 4, days: [] });
  const openEdit = async (id) => {
    try {
      const { data } = await getTemplate(id);
      setEditing(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to open template');
    }
  };

  const handleDelete = async (t) => {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    try {
      await deleteTemplate(t.id);
      refresh();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete');
    }
  };

  if (editing) {
    return (
      <TemplateBuilder
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">My Plans</h2>
        <button
          onClick={openNew}
          className="bg-[#c0c1ff] text-[#1000a9] rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[#a9aaff]"
        >
          + New plan
        </button>
      </div>
      <p className="text-xs text-white/50">
        Apply one to a specific athlete. <strong>Plan</strong> tab.
      </p>

      {error && <p className="text-red-300 text-sm bg-red-500/15 border border-red-400/30 rounded p-2">{error}</p>}
      {loading && <Spinner />}

      {!loading && templates.length === 0 && (
        <p className="text-white/70 text-sm">No private plans yet. Create one to reuse a multi-week block for an athlete.</p>
      )}

      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="bg-black/50 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate text-white">{t.name}</p>
                {t.description && <p className="text-xs text-white/50 truncate">{t.description}</p>}
                <p className="text-xs text-white/40 mt-0.5">
                  {t.weeks_count} week{t.weeks_count !== 1 ? 's' : ''} · {t.day_count} workout{t.day_count !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setApplyTarget(t)}
                  className="text-xs bg-[#c0c1ff] text-[#1000a9] px-2.5 py-1 rounded hover:bg-[#a9aaff]"
                >
                  Apply
                </button>
                <button
                  onClick={() => openEdit(t.id)}
                  className="text-xs border border-white/20 text-white/80 px-2.5 py-1 rounded hover:bg-white/10"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className="text-xs text-red-300 bg-red-500/10 border border-red-400/30 px-2.5 py-1 rounded hover:bg-red-500/20 hover:text-red-200 active:scale-95 transition flex items-center gap-1.5"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {applyTarget && (
        <AthleteApplyModal template={applyTarget} onClose={() => setApplyTarget(null)} />
      )}
    </div>
  );
}
