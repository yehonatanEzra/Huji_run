import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isCoachLike } from '../utils/roles';
import { getFeed, createAnnouncement, updateAnnouncement, deleteAnnouncement, toggleReaction, addComment, deleteComment } from '../api/feed';
import { listGroups } from '../api/coach';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

const EMOJI_MAP = {
  thumbsup: '👍',
  fire: '🔥',
  muscle: '💪',
  dislike: '👎',
  sad: '😢',
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Avatar({ photoUrl, name, size = 'sm' }) {
  const cls = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className={`${cls} rounded-full object-cover`} />;
  }
  return (
    <div className={`${cls} rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600`}>
      {name?.charAt(0).toUpperCase()}
    </div>
  );
}

export default function FeedPage() {
  const { user } = useAuth();
  const isCoach = isCoachLike(user);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', training_group_id: '' });
  const [editingId, setEditingId] = useState(null); // when set, the composer edits this post
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [commentTexts, setCommentTexts] = useState({});
  const [expandedComments, setExpandedComments] = useState({});
  const [authorFilter, setAuthorFilter] = useState('all'); // 'all' or 'coach'

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
    // Both coaches and athletes need the group name for the "Group" pill on each post
    listGroups().then(r => setGroups(r.data)).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      title: '', body: '',
      // Athletes can only post to their own group; default it for them
      training_group_id: isCoach ? '' : (user?.training_group_id ? String(user.training_group_id) : ''),
    });
    setShowCreate(true);
  };

  const openEdit = (post) => {
    setEditingId(post.id);
    setForm({
      title: post.title,
      body: post.body,
      training_group_id: post.training_group_id ? String(post.training_group_id) : '',
    });
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      const payload = { title: form.title, body: form.body };
      // Athletes always post to their own group
      if (!isCoach) {
        if (!user?.training_group_id) {
          alert("You're not assigned to a group yet — ask your coach to add you.");
          setSaving(false);
          return;
        }
        payload.training_group_id = user.training_group_id;
      } else if (form.training_group_id) {
        payload.training_group_id = parseInt(form.training_group_id);
      }
      if (editingId) {
        await updateAnnouncement(editingId, payload);
      } else {
        await createAnnouncement(payload);
      }
      setShowCreate(false);
      setEditingId(null);
      setForm({ title: '', body: '', training_group_id: '' });
      setLoading(true);
      fetchFeed();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Could not save the post.');
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

  const handleComment = async (postId) => {
    const text = commentTexts[postId]?.trim();
    if (!text) return;
    try {
      const { data } = await addComment(postId, text);
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        return { ...p, comments: [...p.comments, data], comment_count: p.comment_count + 1 };
      }));
      setCommentTexts(prev => ({ ...prev, [postId]: '' }));
      setExpandedComments(prev => ({ ...prev, [postId]: true }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    try {
      await deleteComment(postId, commentId);
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        return {
          ...p,
          comments: p.comments.filter(c => c.id !== commentId),
          comment_count: p.comment_count - 1,
        };
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

  const canPost = isCoach || !!user?.training_group_id;
  const visiblePosts = authorFilter === 'coach'
    ? posts.filter(p => p.author_role === 'coach' || p.author_role === 'admin')
    : posts;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Team Feed</h2>
        {canPost && (
          <button
            onClick={openCreate}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + New Post
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
        <button
          onClick={() => setAuthorFilter('all')}
          className={`flex-1 py-1.5 text-sm font-medium transition ${authorFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
        >All posts</button>
        <button
          onClick={() => setAuthorFilter('coach')}
          className={`flex-1 py-1.5 text-sm font-medium transition ${authorFilter === 'coach' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
        >Coach only</button>
      </div>

      {visiblePosts.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No announcements yet</p>
      ) : (
        <div className="space-y-3">
          {visiblePosts.map(post => {
            const showComments = expandedComments[post.id];
            return (
              <div key={post.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Avatar photoUrl={post.author_photo_url} name={post.author_name} />
                    <div>
                      <h3 className="font-semibold text-sm">{post.title}</h3>
                      <p className="text-xs text-gray-400">
                        <span className={(post.author_role === 'coach' || post.author_role === 'admin') ? 'text-amber-600 font-semibold' : ''}>{post.author_name}</span> · {timeAgo(post.created_at)}
                        {post.training_group_id && (
                          <span className="ml-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px]">
                            {groups.find(g => g.id === post.training_group_id)?.name || 'Group'}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(isCoach || (post.author_id === user?.id)) && (
                      <button
                        onClick={() => openEdit(post)}
                        className="text-xs text-blue-600 hover:underline"
                      >Edit</button>
                    )}
                    {(isCoach || (post.author_id === user?.id)) && (
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="text-gray-300 hover:text-red-500 text-lg leading-none"
                      >×</button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{post.body}</p>

                <div className="flex items-center gap-2 mb-2">
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
                  {post.comment_count > 0 && (
                    <button
                      onClick={() => setExpandedComments(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
                      className="ml-auto text-xs text-gray-500 hover:text-gray-700"
                    >
                      💬 {post.comment_count} {post.comment_count === 1 ? 'comment' : 'comments'}
                    </button>
                  )}
                </div>

                {showComments && post.comments.length > 0 && (
                  <div className="border-t pt-2 mt-2 space-y-2">
                    {post.comments.map(c => (
                      <div key={c.id} className="flex items-start gap-2">
                        <Avatar photoUrl={c.photo_url} name={c.user_name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs">
                            <span className={`font-semibold ${(c.user_role === 'coach' || c.user_role === 'admin') ? 'text-amber-600' : ''}`}>{c.user_name}</span>
                            <span className="text-gray-400 ml-1">{timeAgo(c.created_at)}</span>
                          </p>
                          <p className="text-sm text-gray-700">{c.body}</p>
                        </div>
                        {(c.user_id === user?.id || isCoach) && (
                          <button
                            onClick={() => handleDeleteComment(post.id, c.id)}
                            className="text-gray-300 hover:text-red-500 text-sm"
                          >×</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Write a comment..."
                    value={commentTexts[post.id] || ''}
                    onChange={e => setCommentTexts(prev => ({ ...prev, [post.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleComment(post.id); }}
                    className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => handleComment(post.id)}
                    disabled={!commentTexts[post.id]?.trim()}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >Send</button>
                </div>
              </div>
            );
          })}
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

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditingId(null); }}
        title={editingId ? 'Edit post' : 'New post'}>
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
          {isCoach && !editingId ? (
            <select
              value={form.training_group_id}
              onChange={e => setForm({ ...form, training_group_id: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All athletes (global)</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          ) : !isCoach ? (
            <p className="text-xs text-gray-500">
              Posting to{' '}
              <span className="font-semibold">
                {groups.find(g => g.id === user?.training_group_id)?.name || 'your group'}
              </span>
            </p>
          ) : null}
          <button
            onClick={handleCreate}
            disabled={saving || !form.title.trim() || !form.body.trim()}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Post'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
