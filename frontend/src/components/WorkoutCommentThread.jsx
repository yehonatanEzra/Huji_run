import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import {
  listWorkoutComments,
  createWorkoutComment,
  deleteWorkoutComment,
} from '../api/workoutComments';

export default function WorkoutCommentThread({ workoutLogId, onCountChange }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!workoutLogId) return;
    let alive = true;
    setLoading(true);
    listWorkoutComments(workoutLogId)
      .then(({ data }) => {
        if (!alive) return;
        setComments(data);
        onCountChange?.(data.length);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutLogId]);

  const handlePost = async () => {
    const text = draft.trim();
    if (!text || !workoutLogId) return;
    setPosting(true);
    try {
      const { data } = await createWorkoutComment(workoutLogId, text);
      const next = [...comments, data];
      setComments(next);
      setDraft('');
      onCountChange?.(next.length);
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (commentId) => {
    if (!confirm('Delete this comment?')) return;
    await deleteWorkoutComment(workoutLogId, commentId);
    const next = comments.filter(c => c.id !== commentId);
    setComments(next);
    onCountChange?.(next.length);
  };

  if (!workoutLogId) return null;

  return (
    <div className="border-t border-white/15 pt-3">
      <p className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
        <span>💬 Comments</span>
        {comments.length > 0 && (
          <span className="text-xs text-white/45">({comments.length})</span>
        )}
      </p>

      {loading ? (
        <p className="text-xs text-white/40 italic">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-white/40 italic mb-2">No comments yet. Start the conversation.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {comments.map((c) => {
            const mine = user && c.author_id === user.id;
            const isCoach = c.author_role === 'coach' || c.author_role === 'admin';
            return (
              <div
                key={c.id}
                className={`rounded-lg px-3 py-2 text-sm border ${
                  isCoach
                    ? 'bg-blue-400/15 border-blue-400/30'
                    : 'bg-white/10 border-white/15'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className={`text-xs font-semibold ${isCoach ? 'text-blue-300' : 'text-white/80'}`}>
                    {c.author_name}
                    {isCoach && <span className="ml-1 text-[10px] uppercase tracking-wider bg-blue-400/20 text-blue-300 px-1.5 py-0.5 rounded">coach</span>}
                  </span>
                  <span className="text-[10px] text-white/35">
                    {format(new Date(c.created_at), 'MMM d, HH:mm')}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-white/85">{c.body}</p>
                {(mine || user?.role === 'coach' || user?.role === 'admin') && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="mt-1 text-[10px] text-white/30 hover:text-red-400 transition"
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a comment…"
          rows={2}
          className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
        />
        <button
          onClick={handlePost}
          disabled={posting || !draft.trim()}
          className="bg-blue-500 hover:bg-blue-400 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 transition"
        >
          {posting ? '…' : 'Post'}
        </button>
      </div>
    </div>
  );
}
