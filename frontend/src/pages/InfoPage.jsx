import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getInfoSections, createInfoSection, updateInfoSection, deleteInfoSection, moveInfoSection,
} from '../api/info';
import Spinner from '../components/ui/Spinner';
import Modal from '../components/ui/Modal';

const GLASS = 'bg-[#161616]/85 backdrop-blur-2xl border border-white/10';
const INPUT = 'w-full bg-[#1c1b1c]/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20';

// ── Light-markdown rendering ─────────────────────────────────────────────────
// Supported in a card body:  **bold** inline · a line that is entirely **…**
// becomes a sub-heading · lines starting with "- " become bullets.
function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => {
    const m = p.match(/^\*\*([^*]+)\*\*$/);
    return m
      ? <strong key={i} className="text-white font-semibold">{m[1]}</strong>
      : <span key={i}>{p}</span>;
  });
}

function Body({ text }) {
  const lines = (text || '').split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (line.trim() === '') return <div key={i} className="h-1.5" />;
        const head = line.match(/^\*\*(.+)\*\*$/);
        if (head) return <p key={i} className="text-sm font-semibold text-white pt-1.5">{head[1]}</p>;
        if (line.startsWith('- ')) return (
          <div key={i} className="flex gap-2 text-sm text-white/75">
            <span className="text-[#c0c1ff] shrink-0">•</span>
            <span>{renderInline(line.slice(2))}</span>
          </div>
        );
        return <p key={i} className="text-sm text-white/75 leading-relaxed">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function Section({ section, defaultOpen, isAdmin, isFirst, isLast, onEdit, onDelete, onMove }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={`${GLASS} rounded-2xl overflow-hidden`}>
      <div className="flex items-center">
        <button onClick={() => setOpen((o) => !o)} className="flex-1 flex items-center gap-3 px-4 py-3.5 text-left min-w-0">
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-white">{section.title}</p>
            {section.summary && <p className="text-xs text-white/50 mt-0.5">{section.summary}</p>}
          </div>
          <span className={`text-[#c0c1ff] text-lg shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
        </button>
        {isAdmin && (
          <div className="flex items-center gap-0.5 pr-2 shrink-0">
            <button onClick={() => onMove('up')} disabled={isFirst} className="w-7 h-7 rounded-lg text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 transition" title="Move up">↑</button>
            <button onClick={() => onMove('down')} disabled={isLast} className="w-7 h-7 rounded-lg text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 transition" title="Move down">↓</button>
            <button onClick={onEdit} className="px-2 h-7 rounded-lg text-xs text-[#c0c1ff] hover:bg-white/10 transition">Edit</button>
            <button onClick={onDelete} className="px-2 h-7 rounded-lg text-xs text-red-300 hover:bg-white/10 transition">Delete</button>
          </div>
        )}
      </div>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-white/10">
          <Body text={section.body} />
        </div>
      )}
    </div>
  );
}

function EditModal({ section, onClose, onSaved }) {
  const isNew = !section?.id;
  const [title, setTitle] = useState(section?.title || '');
  const [summary, setSummary] = useState(section?.summary || '');
  const [body, setBody] = useState(section?.body || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) { alert('Title is required'); return; }
    setBusy(true);
    try {
      const payload = { title, summary, body };
      if (isNew) await createInfoSection(payload);
      else await updateInfoSection(section.id, payload);
      onSaved();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Could not save');
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} panelClassName="bg-[#131314] border-t border-white/10">
      <h3 className="text-base font-bold text-white mb-3">{isNew ? 'Add card' : 'Edit card'}</h3>
      <div className="space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/50">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${INPUT} mt-1`} placeholder="e.g. 5 · Insights" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/50">Summary (optional)</label>
          <input value={summary} onChange={(e) => setSummary(e.target.value)} className={`${INPUT} mt-1`} placeholder="One line shown under the title" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/50">Body</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className={`${INPUT} mt-1 font-mono text-xs leading-relaxed`} placeholder={'**A heading**\nA paragraph of text.\n- a bullet\n- another bullet'} />
          <p className="text-[11px] text-white/40 mt-1">
            Formatting: a line wrapped in <code className="text-[#c0c1ff]">**like this**</code> becomes a heading · lines starting with <code className="text-[#c0c1ff]">- </code> become bullets · <code className="text-[#c0c1ff]">**bold**</code> works inline.
          </p>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} disabled={busy} className="flex-1 border border-white/20 rounded-xl py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50 transition">Cancel</button>
          <button onClick={save} disabled={busy} className="flex-1 bg-[#c0c1ff] text-[#1000a9] rounded-xl py-2.5 text-sm font-bold hover:bg-[#d0d1ff] disabled:opacity-50 transition">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  );
}

export default function InfoPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // section object, {} for new, or null

  const load = useCallback(() => {
    setLoading(true);
    getInfoSections().then(({ data }) => setSections(data)).catch(() => setSections([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (s) => {
    if (!confirm(`Delete the card “${s.title}”?`)) return;
    try { await deleteInfoSection(s.id); load(); } catch (e) { alert(e?.response?.data?.detail || 'Could not delete'); }
  };
  const handleMove = async (s, direction) => {
    try { const { data } = await moveInfoSection(s.id, direction); setSections(data); } catch (e) { alert(e?.response?.data?.detail || 'Could not move'); }
  };

  return (
    <div className="relative pb-8">
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />

      <div className="flex items-start justify-between mb-6">
        <h1 className="text-2xl font-black text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">Info</h1>
        {isAdmin && (
          <button onClick={() => setEditing({})} className="bg-[#c0c1ff] text-[#1000a9] text-sm px-4 py-1.5 rounded-full font-bold hover:scale-[1.02] active:scale-95 transition">+ Add card</button>
        )}
      </div>
       
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : sections.length === 0 ? (
        <p className="text-center text-white/45 py-16">No info yet.{isAdmin ? ' Tap “+ Add card” to start.' : ''}</p>
      ) : (
        <div className="space-y-3">
          {sections.map((section, i) => (
            <Section
              key={section.id}
              section={section}
              defaultOpen={i === 0}
              isAdmin={isAdmin}
              isFirst={i === 0}
              isLast={i === sections.length - 1}
              onEdit={() => setEditing(section)}
              onDelete={() => handleDelete(section)}
              onMove={(dir) => handleMove(section, dir)}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          section={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
