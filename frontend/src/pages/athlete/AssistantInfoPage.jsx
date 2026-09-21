import { Link } from 'react-router-dom';
import PageBackground from '../../components/PageBackground';

const GLASS = 'bg-[#161616]/70 backdrop-blur-2xl border border-white/10';

function Card({ children, className = '' }) {
  return <div className={`${GLASS} rounded-2xl p-5 ${className}`}>{children}</div>;
}

export default function AssistantInfoPage() {
  return (
    <div className="pb-10">
      <PageBackground src="/bg.jpg" />

      {/* Hero */}
      <div className="mb-5">
        <h1 className="text-3xl font-black text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">Coach AI</h1>
        <p className="text-white/70 mt-1 max-w-xl">
          Your AI running coach learns how you train, reads your plan and your logs,
          and remembers what works for you — so every answer is about <em>you</em>,
          not generic advice.
        </p>
      </div>

      {/* What it does */}
      <Card className="mb-4">
        <h2 className="text-white font-bold mb-2">What it does</h2>
        <ul className="text-sm text-white/75 space-y-1.5">
          <li>• Reviews your week: planned vs. what you actually ran.</li>
          <li>• Analyzes your training load, consistency, and easy/hard balance.</li>
          <li>• Tracks your progress toward races and personal bests.</li>
          <li>• Answers training questions and flags when something looks off.</li>
        </ul>
        <p className="text-xs text-white/45 mt-3">
          It's read-only — it never changes your workouts or logs. For changes, talk to your coach.
        </p>
      </Card>

      {/* Tiers */}
      <div className="grid gap-4 sm:grid-cols-2 mb-4">
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-white font-bold">Free</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/60 border border-white/15">Included</span>
          </div>
          <p className="text-sm text-white/75 mb-3">
            Ask your coach anything about your training — 6 messages every 72 hours.
          </p>
          <ul className="text-sm text-white/60 space-y-1">
            <li>• Grounded in your last 7 days & personal bests</li>
            <li>• Can pull your weekly load, races & last 3 weeks of workouts</li>
            <li>• 6 messages / 72h</li>
          </ul>
        </Card>

        <Card className="border-[#c0c1ff]/30">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-white font-bold">Premium</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#c0c1ff]/20 text-[#c0c1ff] border border-[#c0c1ff]/30">$10 / month</span>
          </div>
          <p className="text-sm text-white/75 mb-3">
            A coach that remembers you and can dig through months of history while you talk.
          </p>
          <ul className="text-sm text-white/75 space-y-1">
            <li>• Unlimited messages, smarter model</li>
            <li>• Full history: your whole training log (not just recent weeks)</li>
            <li>• AI Notebook — remembers goals, injuries & patterns across chats</li>
          </ul>
        </Card>
      </div>

      {/* How it works */}
      <Card className="mb-4">
        <h2 className="text-white font-bold mb-3">How it works</h2>
        <ol className="text-sm text-white/75 space-y-2">
          <li><span className="text-[#c0c1ff] font-bold">1. Context.</span> Every chat starts grounded in your profile, personal bests and last 7 days of training.</li>
          <li><span className="text-[#c0c1ff] font-bold">2. Tools.</span> When you ask about the bigger picture, the coach pulls exactly what it needs — weekly load, a date range of your log, or your race history — instead of loading everything. Free reaches back a few weeks; premium reaches back months.</li>
          <li><span className="text-[#c0c1ff] font-bold">3. Memory.</span> Premium's AI Notebook is a living set of notes about you. It carries the important things forward so the coach doesn't start from zero each time.</li>
        </ol>
        <p className="text-xs text-white/45 mt-3">
          Your training data stays in Huji Run. The AI reads it to help you train — it is never sold or shared.
        </p>
      </Card>

      <div className="flex gap-2">
        <Link to="/assistant" className="inline-block bg-[#c0c1ff] text-[#1000a9] rounded-xl px-5 py-2.5 text-sm font-bold">
          Try it
        </Link>
        <Link to="/assistant" className="inline-block bg-white/5 border border-white/15 text-white/80 rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-white/10">
          Back to chat
        </Link>
      </div>
    </div>
  );
}
