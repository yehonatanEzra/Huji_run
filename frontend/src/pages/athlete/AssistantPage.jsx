import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageBackground from '../../components/PageBackground';
import { useAuth } from '../../contexts/AuthContext';
import {
  sendMessage, listConversations, getMessages, deleteConversation, getStatus,
  getNotebook, saveNotebook, rewriteNotebook,
} from '../../api/assistant';

const NOTEBOOK_MAX = 1500;

// Coach AI ("Jonny") sub-brand — electric cyan + navy, from the logo.
const GLASS = 'bg-[#0b1e2d]/72 backdrop-blur-2xl border border-[#38c6ff]/12';
const INPUT = 'flex-1 bg-[#06131c]/70 border border-[#38c6ff]/15 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/25 resize-none';

// Jonny's face (the logo), with a cyan glow ring.
function Avatar({ size = 'sm', className = '' }) {
  const dim = size === 'lg' ? 'w-11 h-11' : size === 'md' ? 'w-9 h-9' : 'w-7 h-7';
  return (
    <img src="/coach-ai.png" alt="Jonny"
      className={`${dim} rounded-full object-cover shrink-0 shadow-[0_0_0_2px_rgba(56,198,255,0.5),0_0_12px_rgba(56,198,255,0.35)] ${className}`} />
  );
}

const SUGGESTIONS = [
  'How was my week?',
  'Am I training consistently?',
  'Am I ready for my next race?',
  'Is my training load safe?',
];

// Inline markdown → JSX for a single line. Handles **bold**, *italic* / _italic_,
// and `code`. Tokenizes so the delimiters themselves never render as text.
function renderInline(text, keyPrefix) {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|(?:^|\W)\*[^*\s][^*]*\*(?=\W|$)|(?:^|\W)_[^_\s][^_]*_(?=\W|$))/g;
  const out = [];
  let last = 0;
  let m;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    // The italic alternatives capture a leading boundary char — keep it as plain text.
    let token = m[0];
    let start = m.index;
    const isItalic = /^\W?[*_]/.test(token) && !token.startsWith('**') && !token.startsWith('`');
    if (isItalic && !/^[*_]/.test(token)) {
      out.push(token[0]);
      token = token.slice(1);
      start += 1;
    }
    if (start > last) out.push(text.slice(last, start));
    if (token.startsWith('**')) {
      out.push(<strong key={`${keyPrefix}-${i}`} className="font-bold text-white">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      out.push(<code key={`${keyPrefix}-${i}`} className="px-1 py-0.5 rounded bg-white/10 text-[#7bdbff] text-[0.85em]">{token.slice(1, -1)}</code>);
    } else {
      out.push(<em key={`${keyPrefix}-${i}`} className="italic">{token.slice(1, -1)}</em>);
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Lightweight block-level markdown for assistant replies: paragraphs, bullet
// lists (- / *), and numbered lists. Avoids a heavy markdown dependency.
function MarkdownText({ text }) {
  const lines = (text || '').split('\n');
  const blocks = [];
  let list = null; // { ordered, items: [] }
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`l-${blocks.length}`} className={`${list.ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-0.5 my-1`}>
        {list.items.map((it, idx) => <li key={idx}>{renderInline(it, `li-${blocks.length}-${idx}`)}</li>)}
      </Tag>
    );
    list = null;
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet) {
      if (!list || list.ordered) flush();
      list = list || { ordered: false, items: [] };
      list.items.push(bullet[1]);
    } else if (numbered) {
      if (!list || !list.ordered) flush();
      list = list || { ordered: true, items: [] };
      list.items.push(numbered[1]);
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      blocks.push(<p key={`p-${idx}`} className="my-0.5">{renderInline(line, `p-${idx}`)}</p>);
    }
  });
  flush();
  return <div className="space-y-1">{blocks}</div>;
}

export default function AssistantPage() {
  const { user } = useAuth();
  const isPremium = !!user?.ai_access;
  const [tab, setTab] = useState('chat');
  // Bumping this counter asks the (premium-only) ChatTab to open its history
  // modal — the History control lives in the tab bar but the modal state is
  // owned by ChatTab, so we signal it rather than lift all of that state up.
  const [historyTrigger, setHistoryTrigger] = useState(0);

  return (
    <div className="flex flex-col h-[calc(100dvh-9rem)]">
      <PageBackground src="/bg.jpg" />
      {/* Jonny's cyan "mode" tint over the shared track background */}
      <div className="fixed inset-0 -z-10" style={{ background: 'radial-gradient(120% 50% at 82% -6%, rgba(56,198,255,0.22) 0%, rgba(11,30,45,0) 55%), linear-gradient(180deg, rgba(6,20,30,0.38) 0%, rgba(5,12,18,0.58) 100%)' }} />

      <div className="mb-3">
        <div className="flex items-center gap-2.5">
          <Avatar size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white leading-none [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">Jonny</h1>
              {isPremium && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#38c6ff]/20 text-[#7bdbff] border border-[#38c6ff]/30">Premium</span>
              )}
            </div>
            <p className="text-[11px] text-white/55 mt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              Coach AI · your running coach
            </p>
          </div>
          <Link to="/assistant/info"
            className="ml-auto shrink-0 flex items-center gap-1 text-xs font-semibold text-[#c0c1ff] bg-[#c0c1ff]/12 border border-[#c0c1ff]/30 rounded-full px-3 py-1.5 hover:bg-[#c0c1ff]/22 transition">
            <span className="text-[13px] leading-none">ⓘ</span> How it works
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex gap-1 mb-3 p-1 rounded-xl bg-black/40 backdrop-blur-md border border-[#38c6ff]/15 self-start">
        <button onClick={() => setTab('chat')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
            tab === 'chat' ? 'bg-[#c0c1ff] text-[#1000a9] shadow' : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}>
          Chat
        </button>
        {isPremium && (
          <button onClick={() => { setTab('chat'); setHistoryTrigger((t) => t + 1); }}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition">
            History
          </button>
        )}
        <button onClick={() => setTab('notebook')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
            tab === 'notebook' ? 'bg-[#c0c1ff] text-[#1000a9] shadow' : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}>
          Jonny's Notebook
        </button>
      </div>

      {tab === 'chat'
        ? <ChatTab isPremium={isPremium} historyTrigger={historyTrigger} />
        : <NotebookTab isPremium={isPremium} />}
    </div>
  );
}

function ChatTab({ isPremium, historyTrigger = 0 }) {
  const { user } = useAuth();
  const firstName = (user?.full_name || '').trim().split(' ')[0];
  const [messages, setMessages] = useState([]); // {role, content, tools?}
  const [conversationId, setConversationId] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null); // {premium, remaining, limit}
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(null); // null = not loaded; [] = loaded/empty
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  // Open to a clean chat — past conversations live in History. Only load status.
  useEffect(() => {
    (async () => {
      try {
        const { data: st } = await getStatus();
        setStatus(st);
      } catch { /* non-fatal */ }
    })();
  }, []);

  const openHistory = async () => {
    setShowHistory(true);
    try {
      const { data } = await listConversations();
      setHistory(data);
    } catch { setHistory([]); }
  };

  // The History control lives in the parent tab bar; it bumps historyTrigger to
  // open the modal here. Skip the initial 0 so it only fires on real clicks.
  useEffect(() => {
    if (isPremium && historyTrigger > 0) openHistory();
  }, [historyTrigger]);  // eslint-disable-line react-hooks/exhaustive-deps

  const loadConversation = async (id) => {
    setShowHistory(false);
    setError(null);
    try {
      const { data: msgs } = await getMessages(id);
      setConversationId(id);
      setMessages(msgs.map((m) => ({ role: m.role, content: m.content })));
    } catch { /* ignore */ }
  };

  // Fresh, empty chat. Nothing is persisted until the first message is sent, so
  // leaving an empty chat saves nothing.
  const newChat = () => {
    setShowHistory(false);
    setConversationId(null);
    setMessages([]);
    setError(null);
    setInput('');
  };

  const deleteChat = async (id) => {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await deleteConversation(id);
      setHistory((h) => (h || []).filter((c) => c.id !== id));
      if (id === conversationId) { setConversationId(null); setMessages([]); }
    } catch { /* ignore */ }
  };

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setError(null);
    setInput('');
    setBusy(true);
    const userMsg = { role: 'user', content };
    setMessages((m) => [...m, userMsg]);
    try {
      const { data } = await sendMessage(content, conversationId);
      setConversationId(data.conversation_id);
      setMessages((m) => [...m, { role: 'assistant', content: data.reply, tools: data.tools_used }]);
      if (data.premium === false) setStatus((s) => ({ ...(s || {}), premium: false, remaining: data.remaining }));
    } catch (err) {
      // Nothing was persisted server-side — roll back the optimistic bubble and
      // restore the input so the athlete can retry.
      setMessages((m) => m.filter((msg) => msg !== userMsg));
      setInput(content);
      setError({
        text: err?.response?.data?.detail || 'The assistant is unavailable right now.',
        limit: err?.response?.status === 429,
      });
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {status && !status.premium && (
        <p className="text-xs text-white/55 mb-2">
          Free plan: {status.remaining ?? status.limit} of {status.limit} messages left ({status.window_hours}h).{' '}
          <Link to="/assistant/info" className="text-[#c0c1ff] hover:underline">Go premium</Link> for unlimited + full history.
        </p>
      )}

      {/* Toolbar: start a clean chat. History lives in the tab bar above. */}
      {(messages.length > 0 || conversationId) && (
        <div className="flex items-center gap-2 mb-2">
          <button onClick={newChat}
            className="text-xs font-semibold text-white/70 bg-white/5 border border-white/15 rounded-full px-3 py-1.5 hover:bg-white/10 transition">
            ✏️ New chat
          </button>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowHistory(false)}>
          <div className={`${GLASS} rounded-2xl w-full max-w-md max-h-[70vh] overflow-y-auto p-4`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold">Your conversations</h3>
              <button onClick={() => setShowHistory(false)} className="text-white/50 hover:text-white text-lg leading-none">✕</button>
            </div>
            {history === null ? (
              <p className="text-sm text-white/50 py-6 text-center">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-white/50 py-6 text-center">No past conversations yet.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {history.map((c) => (
                    <div key={c.id}
                      className={`flex items-center gap-2 rounded-xl border transition ${
                        c.id === conversationId ? 'bg-[#38c6ff]/15 border-[#38c6ff]/40' : 'bg-white/[0.03] border-white/10 hover:bg-white/10'
                      }`}>
                      <button onClick={() => loadConversation(c.id)} className="flex-1 text-left px-3 py-2.5 min-w-0">
                        <p className="text-sm text-white/90 truncate">{c.preview || 'Conversation'}</p>
                        <p className="text-[11px] text-white/40 mt-0.5">{new Date(c.updated_at).toLocaleDateString()}</p>
                      </button>
                      <button onClick={() => deleteChat(c.id)} title="Delete"
                        className="shrink-0 px-3 py-2.5 text-white/40 hover:text-red-300 transition">🗑</button>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-white/40 mt-3 text-center">Conversations are kept for 30 days.</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {messages.length === 0 && (
          <div className={`${GLASS} rounded-2xl p-5`}>
            <h2 className="text-base font-bold text-white">Hey {firstName || 'there'} 👋</h2>
            <p className="text-xs text-white/55 mt-1 mb-3">I'm Jonny. I've read your logs and your plan. How can I help you?</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#c0c1ff]/15 border border-[#c0c1ff]/40 text-[#c0c1ff] hover:bg-[#c0c1ff]/25 transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role !== 'user' && <Avatar size="sm" className="mb-0.5" />}
            <div className="max-w-[82%]">
              <div className={`px-4 py-2.5 text-sm ${
                m.role === 'user'
                  ? 'rounded-2xl rounded-br-md bg-[#c0c1ff] text-[#1000a9] font-medium whitespace-pre-wrap'
                  : `rounded-2xl rounded-bl-md ${GLASS} border-l-2 border-l-[#38c6ff] shadow-[-6px_0_18px_-8px_rgba(56,198,255,0.5)] text-white/90`
              }`}>
                {m.role === 'user' ? m.content : <MarkdownText text={m.content} />}
              </div>
              {m.tools?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {[...new Set(m.tools)].map((t) => (
                    <span key={t} className="text-[10px] text-white/40 bg-[#38c6ff]/8 border border-[#38c6ff]/15 rounded px-1.5 py-0.5">
                      ⚡ used {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-end gap-2 justify-start">
            <Avatar size="sm" className="mb-0.5" />
            <div className={`rounded-2xl rounded-bl-md ${GLASS} border-l-2 border-l-[#38c6ff] px-4 py-3.5 flex gap-1.5`}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#38c6ff] animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#38c6ff] animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#38c6ff] animate-bounce" />
            </div>
          </div>
        )}

        {error && (
          <div className="text-center">
            <p className={`text-xs rounded-xl px-3 py-2 inline-block ${
              error.limit ? 'text-red-300 bg-red-500/15 border border-red-400/40' : 'text-amber-300/90 bg-amber-400/10 border border-amber-400/25'
            }`}>
              {error.text}{' '}
              {error.limit && <Link to="/assistant/info" className="underline">See premium</Link>}
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="pt-2">
        <div className="flex items-end gap-2">
          <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Ask Jonny…" className={INPUT} />
          <button onClick={() => send()} disabled={busy || !input.trim()}
            className="shrink-0 bg-[#c0c1ff] text-[#1000a9] rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-40 transition">
            Send
          </button>
        </div>
        <p className="text-[10px] text-white/35 mt-1.5 text-center">Advice only. Talk to your coach for changes. Not medical advice.</p>
      </div>
    </>
  );
}

function NotebookTab({ isPremium }) {
  const [content, setContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  useEffect(() => {
    if (!isPremium) { setLoading(false); return; }
    (async () => {
      try {
        const { data } = await getNotebook();
        setContent(data.content || '');
        setUpdatedAt(data.updated_at);
      } catch { /* empty */ } finally { setLoading(false); }
    })();
  }, [isPremium]);

  if (!isPremium) {
    return (
      <div className={`${GLASS} rounded-2xl p-6 text-center`}>
        <p className="text-3xl mb-2">🔒</p>
        <h3 className="text-white font-bold mb-1">Jonny's Notebook is a premium feature</h3>
        <p className="text-sm text-white/60 mb-4">
          Jonny's notebook remembers your goals, injuries and patterns across every conversation.
        </p>
        <Link to="/assistant/info" className="inline-block bg-[#c0c1ff] text-[#1000a9] rounded-xl px-4 py-2 text-sm font-bold">
          See premium
        </Link>
      </div>
    );
  }

  const save = async () => {
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      const { data } = await saveNotebook(content);
      setContent(data.content || '');
      setUpdatedAt(data.updated_at);
      setNote({ ok: true, text: 'Saved ✓' });
    } catch (err) {
      setNote({ ok: false, text: err?.response?.data?.detail || "Couldn't save." });
    } finally { setBusy(false); }
  };

  const updateWithAI = async () => {
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      // Rewrite from the most recent conversation.
      const { data: convs } = await listConversations();
      if (!convs.length) { setNote({ ok: false, text: 'Have a conversation first, then update.' }); return; }
      const { data } = await rewriteNotebook(convs[0].id);
      setContent(data.content || '');
      setUpdatedAt(data.updated_at);
      setNote({ ok: true, text: 'Notebook updated by AI ✓ — edit it if you like.' });
    } catch (err) {
      setNote({ ok: false, text: err?.response?.data?.detail || "Couldn't update." });
    } finally { setBusy(false); }
  };

  if (loading) return <div className="text-white/50 text-sm">Loading…</div>;

  return (
    <div className="flex-1 overflow-y-auto">
      <p className="text-xs text-white/55 mb-2">
        What Jonny remembers about you across conversations. Edit it directly, or let Jonny update it from your latest chat.
      </p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, NOTEBOOK_MAX))}
        rows={12}
        placeholder="Jonny's notes will appear here…"
        className={`w-full ${GLASS} rounded-2xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] resize-none`}
      />
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] text-white/40">{content.length}/{NOTEBOOK_MAX}</span>
        {updatedAt && <span className="text-[10px] text-white/40">· updated {new Date(updatedAt).toLocaleDateString()}</span>}
        <div className="ml-auto flex gap-2">
          <button onClick={updateWithAI} disabled={busy}
            className="text-xs font-semibold bg-white/5 border border-white/15 text-white/80 rounded-full px-3 py-1.5 hover:bg-white/10 disabled:opacity-40 transition">
            ✨ Update with AI
          </button>
          <button onClick={save} disabled={busy}
            className="text-xs font-bold bg-[#c0c1ff] text-[#1000a9] rounded-full px-4 py-1.5 disabled:opacity-40 transition">
            Save
          </button>
        </div>
      </div>
      {note && (
        <p className={`text-xs mt-2 ${note.ok ? 'text-emerald-300' : 'text-amber-300/90'}`}>{note.text}</p>
      )}
    </div>
  );
}
