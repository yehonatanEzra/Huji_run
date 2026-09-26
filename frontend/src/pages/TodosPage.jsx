import { useState, useEffect, useCallback } from 'react';
import {
  listTodos, createTodo, updateTodo, deleteTodo, clearCompletedTodos,
} from '../api/todos';
import Spinner from '../components/ui/Spinner';

const GLASS = 'bg-[#161616]/85 backdrop-blur-2xl border border-white/10';
const INPUT = 'w-full bg-[#1c1b1c]/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20';

// ── One row ──────────────────────────────────────────────────────────────────
function TodoRow({ todo, onToggle, onSave, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(todo.text);
  const [note, setNote] = useState(todo.note || '');
  const [busy, setBusy] = useState(false);

  // Re-sync local draft if the item changes underneath us (e.g. after a save).
  useEffect(() => { setText(todo.text); setNote(todo.note || ''); }, [todo.text, todo.note]);

  const hasNote = !!(todo.note && todo.note.trim());

  const save = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onSave(todo.id, { text: trimmed, note: note.trim() || null });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border border-white/10 bg-[#161616]/70 backdrop-blur-xl overflow-hidden`}>
      <div className="flex items-start gap-3 px-3.5 py-3">
        <button
          onClick={() => onToggle(todo)}
          className={`mt-0.5 shrink-0 h-5 w-5 rounded-md border flex items-center justify-center transition
            ${todo.done
              ? 'bg-[#c0c1ff] border-[#c0c1ff] text-black'
              : 'border-white/30 hover:border-[#c0c1ff]'}`}
          aria-label={todo.done ? 'Mark as not done' : 'Mark as done'}
        >
          {todo.done && (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.3 3.3 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {editing ? (
          <div className="flex-1 min-w-0 space-y-2">
            <input
              className={INPUT}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What needs doing?"
              autoFocus
            />
            <textarea
              className={`${INPUT} resize-none`}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Notes (optional)"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={save}
                disabled={busy || !text.trim()}
                className="text-xs font-semibold bg-[#c0c1ff] text-black rounded-lg px-3 py-1.5 disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => { setEditing(false); setText(todo.text); setNote(todo.note || ''); }}
                className="text-xs text-white/50 hover:text-white/80 px-2 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => hasNote && setExpanded((v) => !v)}
            className="flex-1 min-w-0 text-left"
          >
            <p className={`text-sm ${todo.done ? 'text-white/40 line-through' : 'text-white'}`}>
              {todo.text}
            </p>
            {hasNote && (
              <p className={`text-xs mt-1 text-white/70 ${expanded ? 'whitespace-pre-wrap' : 'truncate'}`}>
                {todo.note}
              </p>
            )}
          </button>
        )}

        {!editing && (
          <div className="shrink-0 flex items-center gap-1">
            <button
              onClick={() => { setEditing(true); setExpanded(true); }}
              className="text-white/40 hover:text-white/80 p-1"
              aria-label="Edit"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => onDelete(todo.id)}
              className="text-white/40 hover:text-red-400 p-1"
              aria-label="Delete"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TodosPage() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listTodos()
      .then(({ data }) => setTodos(data))
      .catch(() => setTodos([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      const { data } = await createTodo({ text: trimmed, note: note.trim() || null });
      setTodos((prev) => [data, ...prev]);
      setText('');
      setNote('');
      setShowNote(false);
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (todo) => {
    // Optimistic — flip locally, then persist.
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)));
    try {
      await updateTodo(todo.id, { done: !todo.done });
    } catch {
      load();
    }
  };

  const save = async (id, body) => {
    const { data } = await updateTodo(id, body);
    setTodos((prev) => prev.map((t) => (t.id === id ? data : t)));
  };

  const remove = async (id) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTodo(id);
    } catch {
      load();
    }
  };

  const clearDone = async () => {
    const hadDone = todos.some((t) => t.done);
    if (!hadDone) return;
    setTodos((prev) => prev.filter((t) => !t.done));
    try {
      await clearCompletedTodos();
    } catch {
      load();
    }
  };

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <>
      {/* Shared app background: photo + gradient scrim, matching Calendar/Feed/Races. */}
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.40) 0%, rgba(0,0,0,0.48) 100%)' }} />

      <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-white">Todos</h1>
        <span className="text-xs text-white/40">Private to you</span>
      </div>

      {/* Add form */}
      <form onSubmit={add} className={`rounded-2xl p-3 space-y-2 ${GLASS}`}>
        <div className="flex gap-2">
          <input
            className={INPUT}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a todo…"
            maxLength={300}
          />
          <button
            type="submit"
            disabled={!text.trim() || adding}
            className="shrink-0 text-sm font-semibold bg-[#c0c1ff] text-black rounded-xl px-4 disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {showNote ? (
          <textarea
            className={`${INPUT} resize-none`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notes (optional)"
            maxLength={2000}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="text-xs text-white/40 hover:text-white/70"
          >
            + Add a note
          </button>
        )}
      </form>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : todos.length === 0 ? (
        <p className="text-center text-sm text-white/40 py-10">
          No todos yet. Add your first one above.
        </p>
      ) : (
        <div className="space-y-4">
          {open.length > 0 && (
            <div className="space-y-2">
              {open.map((t) => (
                <TodoRow key={t.id} todo={t} onToggle={toggle} onSave={save} onDelete={remove} />
              ))}
            </div>
          )}

          {done.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
                  Done · {done.length}
                </p>
                <button onClick={clearDone} className="text-xs text-white/40 hover:text-red-400">
                  Clear completed
                </button>
              </div>
              {done.map((t) => (
                <TodoRow key={t.id} todo={t} onToggle={toggle} onSave={save} onDelete={remove} />
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </>
  );
}
