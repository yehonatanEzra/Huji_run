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
    <div className="border-t pt-3">
      <p className="text-sm font-medium mb-2 flex items-center gap-2">
        <span>💬 Comments</span>
        {comments.length > 0 && (
          <span className="text-xs text-gray-500">({comments.length})</span>
        )}
      </p>

      {loading ? (
        <p className="text-xs text-gray-400 italic">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-400 italic mb-2">No comments yet. Start the conversation.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {comments.map((c) => {
            const mine = user && c.author_id === user.id;
            const isCoach = c.author_role === 'coach';
            return (
              <div
                key={c.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  isCoach ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className={`text-xs font-medium ${isCoach ? 'text-blue-700' : 'text-gray-700'}`}>
                    {c.author_name}
                    {isCoach && <span className="ml-1 text-[10px] uppercase tracking-wider bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">coach</span>}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {format(new Date(c.created_at), 'MMM d, HH:mm')}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-gray-800">{c.body}</p>
                {(mine || user?.role === 'coach') && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="mt-1 text-[10px] text-gray-400 hover:text-red-600"
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
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <button
          onClick={handlePost}
          disabled={posting || !draft.trim()}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {posting ? '…' : 'Post'}
        </button>
      </div>
    </div>
  );
}
