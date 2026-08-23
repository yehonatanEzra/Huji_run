import { useState, useRef, useEffect } from 'react';
import PageBackground from '../../components/PageBackground';
import { useAuth } from '../../contexts/AuthContext';
import { chatWithAssistant, getWeeklySummary, compactConversation } from '../../api/assistant';

const FREE_LIMIT = 5;
const COMPACT_AT = 20; // messages before we summarize + start fresh to save tokens

const GLASS = 'bg-[#161616]/70 backdrop-blur-2xl border border-white/10';
const INPUT = 'flex-1 bg-[#1c1b1c]/70 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20 resize-none';

const SUGGESTIONS = [
  'How was my week?',
  'Am I training consistently?',
  'What did my coach plan for me?',
  'Any tips for my next run?',
];

export default function AssistantPage() {
  const { user } = useAuth();
  const isPremium = !!user?.ai_access;
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [remaining, setRemaining] = useState(null); // free messages left; null until first reply
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const runError = (err) =>
    setError({
      text: err?.response?.data?.detail || 'The assistant is unavailable right now.',
      limit: err?.response?.status === 429,
    });

  const applyQuota = (data) => { if (data && data.premium === false) setRemaining(data.remaining); };

  // Keep the whole conversation as context until it gets long, then summarize it
  // into one brief and start fresh (saves tokens; like /compact).
  const compactedBase = async (history) => {
    if (history.length < COMPACT_AT) return history;
    try {
      const { data } = await compactConversation(history);
      return [{ role: 'assistant', content: `(Summary of our earlier chat) ${data.summary}` }];
    } catch {
      return history; // compaction failed — keep going with full history
    }
  };

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setError(null);
    setInput('');
    setBusy(true);
    try {
      const base = await compactedBase(messages);
      const next = [...base, { role: 'user', content }];
      setMessages(next);
      const { data } = await chatWithAssistant(next);
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
      applyQuota(data);
    } catch (err) {
      runError(err);
    } finally {
      setBusy(false);
    }
  };

  const summarize = async () => {
    if (busy) return;
    setError(null);
    setMessages((m) => [...m, { role: 'user', content: 'Summarize my week' }]);
    setBusy(true);
    try {
      const { data } = await getWeeklySummary();
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
      applyQuota(data);
    } catch (err) {
      runError(err);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-9rem)]">
      <PageBackground src="/bg.jpg" />

      <div className="mb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">Coach AI</h1>
          {isPremium && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#c0c1ff]/20 text-[#c0c1ff] border border-[#c0c1ff]/30">Premium</span>
          )}
        </div>
        <p className="text-xs text-white/55">
          Ask about your training. It knows your plan and your logs.
          {!isPremium && (
            <span className="text-white/45">{' · '}Free plan: {remaining ?? FREE_LIMIT} of {FREE_LIMIT} messages left (48h).</span>
          )}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {messages.length === 0 && (
          <div className={`${GLASS} rounded-2xl p-5`}>
            <p className="text-sm text-white/80 mb-3">👋 Hi! I can look at what your coach planned and what you logged, and help you make sense of it. Try:</p>
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
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-[#c0c1ff] text-[#1000a9] font-medium'
                : `${GLASS} text-white/90`
            }`}>
              {m.content}
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
              error.limit
                ? 'text-red-300 bg-red-500/15 border border-red-400/40'
                : 'text-amber-300/90 bg-amber-400/10 border border-amber-400/25'
            }`}>{error.text}</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="pt-2">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={summarize} disabled={busy}
            className="text-xs font-semibold bg-white/5 border border-white/15 text-white/75 rounded-full px-3 py-1.5 hover:bg-white/10 disabled:opacity-40 transition">
            ✨ Summarize my week
          </button>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask your Coach AI…"
            className={INPUT}
          />
          <button onClick={() => send()} disabled={busy || !input.trim()}
            className="shrink-0 bg-[#c0c1ff] text-[#1000a9] rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-40 transition">
            Send
          </button>
        </div>
        <p className="text-[10px] text-white/35 mt-1.5 text-center">Advice only. Talk to your coach for changes. Not medical advice.</p>
      </div>
    </div>
  );
}
