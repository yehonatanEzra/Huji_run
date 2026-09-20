import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageBackground from '../../components/PageBackground';
import { useAuth } from '../../contexts/AuthContext';
import {
  sendMessage, listConversations, getMessages, getStatus,
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
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  // Load the most recent conversation + tier status on mount.
  useEffect(() => {
    (async () => {
      try {
        const { data: st } = await getStatus();
        setStatus(st);
      } catch { /* non-fatal */ }
      try {
        const { data: convs } = await listConversations();
        if (convs.length > 0) {
          const id = convs[0].id;
          setConversationId(id);
          const { data: msgs } = await getMessages(id);
          setMessages(msgs.map((m) => ({ role: m.role, content: m.content })));
        }
      } catch { /* start fresh */ }
    })();
  }, []);

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
              <div className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-[#c0c1ff] text-[#1000a9] font-medium' : `${GLASS} text-white/90`
              }`}>
                {m.content}
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
