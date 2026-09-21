import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageBackground from '../../components/PageBackground';
import { useAuth } from '../../contexts/AuthContext';
import {
  sendMessage, listConversations, getMessages, deleteConversation, getStatus,
  getNotebook, saveNotebook, rewriteNotebook,
} from '../../api/assistant';

const NOTEBOOK_MAX = 1500;

const GLASS = 'bg-[#161616]/70 backdrop-blur-2xl border border-white/10';
const INPUT = 'flex-1 bg-[#1c1b1c]/70 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20 resize-none';

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
      out.push(<code key={`${keyPrefix}-${i}`} className="px-1 py-0.5 rounded bg-white/10 text-[#c0c1ff] text-[0.85em]">{token.slice(1, -1)}</code>);
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

  return (
    <div className="flex flex-col h-[calc(100dvh-9rem)]">
      <PageBackground src="/bg.jpg" />

      <div className="mb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">Coach AI</h1>
          {isPremium && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#c0c1ff]/20 text-[#c0c1ff] border border-[#c0c1ff]/30">Premium</span>
          )}
          <Link to="/assistant/info" className="ml-auto text-xs text-white/55 hover:text-white underline underline-offset-2">
            How it works
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex gap-1 mb-3 p-1 rounded-xl bg-black/40 backdrop-blur-md border border-white/15 self-start">
        {[['chat', 'Chat'], ['notebook', 'AI Notebook']].map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              tab === v ? 'bg-white text-black shadow' : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'chat'
        ? <ChatTab isPremium={isPremium} />
        : <NotebookTab isPremium={isPremium} />}
    </div>
  );
}

function ChatTab({ isPremium }) {
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

      {/* Toolbar: reopen past chats (premium), or start a clean one */}
      <div className="flex items-center gap-2 mb-2">
        {isPremium && (
          <button onClick={openHistory}
            className="text-xs font-semibold text-white/70 bg-white/5 border border-white/15 rounded-full px-3 py-1.5 hover:bg-white/10 transition">
            🕘 History
          </button>
        )}
        {(messages.length > 0 || conversationId) && (
          <button onClick={newChat}
            className="text-xs font-semibold text-white/70 bg-white/5 border border-white/15 rounded-full px-3 py-1.5 hover:bg-white/10 transition">
            ✏️ New chat
          </button>
        )}
      </div>

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
                        c.id === conversationId ? 'bg-[#c0c1ff]/15 border-[#c0c1ff]/40' : 'bg-white/[0.03] border-white/10 hover:bg-white/10'
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
            <p className="text-sm text-white/80 mb-3">👋 I'm your AI running coach. I can see your plan, your logs and your PBs. Ask me anything:</p>
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
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%]">
              <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                m.role === 'user' ? 'bg-[#c0c1ff] text-[#1000a9] font-medium whitespace-pre-wrap' : `${GLASS} text-white/90`
              }`}>
                {m.role === 'user' ? m.content : <MarkdownText text={m.content} />}
              </div>
              {m.tools?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {[...new Set(m.tools)].map((t) => (
                    <span key={t} className="text-[10px] text-white/40 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                      used {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className={`${GLASS} rounded-2xl px-4 py-3 text-sm text-white/50`}>Thinking…</div>
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
            placeholder="Ask your Coach AI…" className={INPUT} />
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
        <h3 className="text-white font-bold mb-1">AI Notebook is a premium feature</h3>
        <p className="text-sm text-white/60 mb-4">
          Your coach's notebook remembers your goals, injuries and patterns across every conversation.
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
        What your AI coach remembers about you across conversations. Edit it directly, or let the AI update it from your latest chat.
      </p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, NOTEBOOK_MAX))}
        rows={12}
        placeholder="Your coach's notes will appear here…"
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
