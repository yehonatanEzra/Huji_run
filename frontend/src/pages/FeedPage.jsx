import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getFeed, createAnnouncement, deleteAnnouncement, toggleReaction } from '../api/feed';
import { listGroups } from '../api/coach';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

const EMOJI_MAP = {
  thumbsup: '👍',
  fire: '🔥',
  muscle: '💪',
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function FeedPage() {
  const { user } = useAuth();
  const isCoach = user?.role === 'coach';
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', training_group_id: '' });
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchFeed = async (beforeId) => {
    try {
      const { data } = await getFeed(beforeId);
      if (beforeId) {
        setPosts(prev => [...prev, ...data]);
      } else {
        setPosts(data);
      }
      setHasMore(data.length >= 20);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFeed(); }, []);

  useEffect(() => {
    if (isCoach) {
      listGroups().then(r => setGroups(r.data)).catch(() => {});
    }
  }, [isCoach]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      const payload = { title: form.title, body: form.body };
      if (form.training_group_id) payload.training_group_id = parseInt(form.training_group_id);
      await createAnnouncement(payload);
      setShowCreate(false);
      setForm({ title: '', body: '', training_group_id: '' });
      setLoading(true);
      fetchFeed();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteAnnouncement(id);
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleReact = async (postId, emoji) => {
    try {
      const { data } = await toggleReaction(postId, emoji);
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        const reactions = [...p.reactions];
        const idx = reactions.findIndex(r => r.emoji === emoji);
        if (idx >= 0) {
          if (data.count === 0) {
            reactions.splice(idx, 1);
          } else {
            reactions[idx] = data;
          }
        } else if (data.count > 0) {
          reactions.push(data);
        }
        return { ...p, reactions };
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const loadMore = () => {
    if (posts.length > 0) {
      fetchFeed(posts[posts.length - 1].id);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Team Feed</h2>
        {isCoach && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + New Post
          </button>
        )}
      </div>

      {posts.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No announcements yet</p>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <div key={post.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-sm">{post.title}</h3>
                  <p className="text-xs text-gray-400">
                    {post.author_name} · {timeAgo(post.created_at)}
                    {post.training_group_id && (
                      <span className="ml-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px]">
                        {groups.find(g => g.id === post.training_group_id)?.name || 'Group'}
                      </span>
                    )}
                  </p>
                </div>
                {isCoach && (
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="text-gray-300 hover:text-red-500 text-lg leading-none"
                  >
                    ×
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{post.body}</p>
              <div className="flex gap-2">
                {Object.entries(EMOJI_MAP).map(([key, icon]) => {
                  const reaction = post.reactions.find(r => r.emoji === key);
                  return (
                    <button
                      key={key}
                      onClick={() => handleReact(post.id, key)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition ${
                        reaction?.reacted
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      <span>{icon}</span>
                      {reaction?.count > 0 && <span>{reaction.count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {hasMore && (
            <button
              onClick={loadMore}
              className="w-full py-2 text-sm text-blue-600 font-medium hover:bg-blue-50 rounded-lg"
            >
              Load more
            </button>
          )}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Announcement">
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Title"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            placeholder="What would you like to share with the team?"
            value={form.body}
            onChange={e => setForm({ ...form, body: e.target.value })}
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={form.training_group_id}
            onChange={e => setForm({ ...form, training_group_id: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All athletes</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={saving || !form.title.trim() || !form.body.trim()}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Posting...' : 'Post'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
