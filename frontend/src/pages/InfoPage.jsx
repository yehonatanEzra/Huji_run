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

// ── Numbering helpers ────────────────────────────────────────────────────────
// Top-level cards are numbered by position (the first card is the unnumbered
// intro), and subcard numbers derive from that — so reordering renumbers
// everything. Stored titles may still carry a manual "N · " prefix, so strip it
// before composing the displayed label.
const stripLabel = (title) => (title || '').replace(/^\s*[\d.]+\s*·\s*/, '');

// ── Subcard (one level deep) ─────────────────────────────────────────────────
function SubCard({ section, label, isAdmin, isFirst, isLast, actions }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="flex items-center">
        <button onClick={() => setOpen((o) => !o)} className="flex-1 flex items-center gap-3 px-3.5 py-2.5 text-left min-w-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{label}</p>
            {section.summary && <p className="text-[11px] text-white/45 mt-0.5">{section.summary}</p>}
          </div>
          <span className={`text-[#c0c1ff] text-base shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
        </button>
        {isAdmin && (
          <div className="flex items-center gap-0.5 pr-1.5 shrink-0">
            <button onClick={() => actions.onMove(section, 'up')} disabled={isFirst} className="w-6 h-6 rounded-lg text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 transition" title="Move up">↑</button>
            <button onClick={() => actions.onMove(section, 'down')} disabled={isLast} className="w-6 h-6 rounded-lg text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 transition" title="Move down">↓</button>
            <button onClick={() => actions.onEdit(section)} className="px-1.5 h-6 rounded-lg text-[11px] text-[#c0c1ff] hover:bg-white/10 transition">Edit</button>
            <button onClick={() => actions.onDelete(section)} className="px-1.5 h-6 rounded-lg text-[11px] text-red-300 hover:bg-white/10 transition">Del</button>
          </div>
        )}
      </div>
      {open && (
        <div className="px-3.5 pb-3 pt-1 border-t border-white/10">
          <Body text={section.body} />
        </div>
      )}
    </div>
  );
}

// ── Top-level card ───────────────────────────────────────────────────────────
// `num` is the position-derived number (null for the intro card at the top).
function TopCard({ section, num, defaultOpen, isAdmin, isFirst, isLast, actions }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const children = section.children || [];
  const numbered = children.length >= 2; // a lone subcard shows without a "N.1"
  const cleanTitle = stripLabel(section.title);
  const displayTitle = num ? `${num} · ${cleanTitle}` : cleanTitle;

  return (
    <div className={`${GLASS} rounded-2xl overflow-hidden`}>
      <div className="flex items-center">
        <button onClick={() => setOpen((o) => !o)} className="flex-1 flex items-center gap-3 px-4 py-3.5 text-left min-w-0">
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-white">{displayTitle}</p>
            {section.summary && <p className="text-xs text-white/50 mt-0.5">{section.summary}</p>}
          </div>
          <span className={`text-[#c0c1ff] text-lg shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
        </button>
        {isAdmin && (
          <div className="flex items-center gap-0.5 pr-2 shrink-0">
            <button onClick={() => actions.onMove(section, 'up')} disabled={isFirst} className="w-7 h-7 rounded-lg text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 transition" title="Move up">↑</button>
            <button onClick={() => actions.onMove(section, 'down')} disabled={isLast} className="w-7 h-7 rounded-lg text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 transition" title="Move down">↓</button>
            <button onClick={() => actions.onEdit(section)} className="px-2 h-7 rounded-lg text-xs text-[#c0c1ff] hover:bg-white/10 transition">Edit</button>
            <button onClick={() => actions.onDelete(section)} className="px-2 h-7 rounded-lg text-xs text-red-300 hover:bg-white/10 transition">Delete</button>
          </div>
        )}
      </div>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-white/10 space-y-3">
          {section.body?.trim() && <Body text={section.body} />}
          {children.map((c, i) => (
            <SubCard
              key={c.id}
              section={c}
              label={numbered && num ? `${num}.${i + 1} · ${stripLabel(c.title)}` : stripLabel(c.title)}
              isAdmin={isAdmin}
              isFirst={i === 0}
              isLast={i === children.length - 1}
              actions={actions}
            />
          ))}
          {isAdmin && (
            <button
              onClick={() => actions.onAddSub(section)}
              className="w-full border border-dashed border-white/20 rounded-xl py-2 text-xs font-semibold text-white/60 hover:text-white hover:border-white/40 transition"
            >
              + Add subcard
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EditModal({ section, onClose, onSaved }) {
  const isNew = !section?.id;
  const isSub = !!section?.parent_id;
  const [title, setTitle] = useState(section?.title || '');
  const [summary, setSummary] = useState(section?.summary || '');
  const [body, setBody] = useState(section?.body || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) { alert('Title is required'); return; }
    setBusy(true);
    try {
      if (isNew) await createInfoSection({ title, summary, body, parent_id: section?.parent_id ?? null });
      else await updateInfoSection(section.id, { title, summary, body });
      onSaved();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Could not save');
    } finally { setBusy(false); }
  };

  const heading = isNew ? (isSub ? 'Add subcard' : 'Add card') : 'Edit card';

  return (
    <Modal open onClose={onClose} panelClassName="bg-[#131314] border-t border-white/10">
      <h3 className="text-base font-bold text-white mb-3">{heading}</h3>
      <div className="space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/50">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${INPUT} mt-1`} placeholder={isSub ? 'e.g. Tools' : 'e.g. 5 · Coach AI'} />
          {isSub && <p className="text-[11px] text-white/40 mt-1">Numbering (like 5.1) is added automatically from the parent — just write the title.</p>}
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
  const [editing, setEditing] = useState(null); // section object, {} / {parent_id} for new, or null

  const load = useCallback(() => {
    setLoading(true);
    getInfoSections().then(({ data }) => setSections(data)).catch(() => setSections([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const actions = {
    onEdit: (s) => setEditing(s),
    onAddSub: (parent) => setEditing({ parent_id: parent.id }),
    onDelete: async (s) => {
      const extra = s.children?.length ? ` and its ${s.children.length} subcard(s)` : '';
      if (!confirm(`Delete the card “${s.title}”${extra}?`)) return;
      try { await deleteInfoSection(s.id); load(); } catch (e) { alert(e?.response?.data?.detail || 'Could not delete'); }
    },
    onMove: async (s, direction) => {
      try { const { data } = await moveInfoSection(s.id, direction); setSections(data); } catch (e) { alert(e?.response?.data?.detail || 'Could not move'); }
    },
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
            <TopCard
              key={section.id}
              section={section}
              num={i === 0 ? null : String(i)}
              defaultOpen={i === 0}
              isAdmin={isAdmin}
              isFirst={i === 0}
              isLast={i === sections.length - 1}
              actions={actions}
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
