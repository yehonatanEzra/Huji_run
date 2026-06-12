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
    <div className={`${cls} rounded-full bg-[#8083ff]/25 border border-[#8083ff]/30 flex items-center justify-center font-bold text-[#c0c1ff]`}>
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
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.45) 20%, rgba(19,19,20,0.50) 80%)' }} />
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-[#e5e2e3]">Feed</h2>
        {canPost && (
          <button
            onClick={openCreate}
            style={{ boxShadow: '0 0 15px rgba(192,193,255,0.3)' }}
            className="bg-[#c0c1ff] text-[#1000a9] px-4 py-1.5 rounded-full text-sm font-bold hover:scale-[1.02] active:scale-95 transition"
          >
            + New post
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div
        className="flex p-1 mb-4 rounded-full border border-white/5"
        style={{ background: 'rgba(28,27,28,0.5)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        <button
          onClick={() => setAuthorFilter('all')}
          className={`flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition ${authorFilter === 'all' ? 'bg-[#c0c1ff] text-[#1000a9]' : 'text-white/60 hover:text-white'}`}
        >All posts</button>
        <button
          onClick={() => setAuthorFilter('coach')}
          className={`flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition ${authorFilter === 'coach' ? 'bg-[#c0c1ff] text-[#1000a9]' : 'text-white/60 hover:text-white'}`}
        >Coach only</button>
      </div>

      {visiblePosts.length === 0 ? (
        <p className="text-center text-white/40 py-8">No announcements yet</p>
      ) : (
        <div className="space-y-3">
          {visiblePosts.map(post => {
            const showComments = expandedComments[post.id];
            return (
              <div key={post.id} style={{ background: 'rgba(32,31,32,0.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }} className="border border-white/10 rounded-2xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Avatar photoUrl={post.author_photo_url} name={post.author_name} />
                    <div>
                      <h3 className="font-semibold text-sm text-white">{post.title}</h3>
                      <p className="text-xs text-white/50">
                        <span className={(post.author_role === 'coach' || post.author_role === 'admin') ? 'text-white font-bold' : 'text-white/70'}>{post.author_name}</span> · {timeAgo(post.created_at)}
                        {post.training_group_id && (
                          <span className="ml-1 px-1.5 py-0.5 bg-white/20 text-white/80 rounded text-[10px]">
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
                        className="text-xs text-white/60 hover:text-white hover:underline"
                      >Edit</button>
                    )}
                    {(isCoach || (post.author_id === user?.id)) && (
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="text-white/30 hover:text-red-400 text-lg leading-none"
                      >×</button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-white/85 whitespace-pre-wrap mb-3">{post.body}</p>

                <div className="flex items-center gap-2 mb-2">
                  {Object.entries(EMOJI_MAP).map(([key, icon]) => {
                    const reaction = post.reactions.find(r => r.emoji === key);
                    return (
                      <button
                        key={key}
                        onClick={() => handleReact(post.id, key)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition ${
                          reaction?.reacted
                            ? 'bg-[#c0c1ff]/20 border-[#c0c1ff]/40 text-white'
                            : 'bg-white/5 border-white/15 text-white/60 hover:bg-white/15'
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
                      className="ml-auto text-xs text-white/50 hover:text-white/80"
                    >
                      💬 {post.comment_count} {post.comment_count === 1 ? 'comment' : 'comments'}
                    </button>
                  )}
                </div>

                {showComments && post.comments.length > 0 && (
                  <div className="border-t border-white/15 pt-2 mt-2 space-y-2">
                    {post.comments.map(c => (
                      <div key={c.id} className="flex items-start gap-2">
                        <Avatar photoUrl={c.photo_url} name={c.user_name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs">
                            <span className={`font-semibold ${(c.user_role === 'coach' || c.user_role === 'admin') ? 'text-white' : 'text-white/80'}`}>{c.user_name}</span>
                            <span className="text-white/40 ml-1">{timeAgo(c.created_at)}</span>
                          </p>
                          <p className="text-sm text-white/80">{c.body}</p>
                        </div>
                        {(c.user_id === user?.id || isCoach) && (
                          <button
                            onClick={() => handleDeleteComment(post.id, c.id)}
                            className="text-white/25 hover:text-red-400 text-sm"
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
                    className="flex-1 bg-white/5 border border-white/15 rounded-full px-4 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
                  />
                  <button
                    onClick={() => handleComment(post.id)}
                    disabled={!commentTexts[post.id]?.trim()}
                    className="px-4 py-1.5 bg-[#c0c1ff] text-[#1000a9] rounded-full text-sm font-bold hover:scale-[1.02] active:scale-95 disabled:opacity-40 transition"
                  >Send</button>
                </div>
              </div>
            );
          })}
          {hasMore && (
            <button
              onClick={loadMore}
              className="w-full py-2 text-sm text-white/60 font-medium hover:text-white hover:bg-white/10 rounded-lg transition"
            >
              Load more
            </button>
          )}
        </div>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditingId(null); }}
        title={editingId ? 'Edit post' : 'New post'}
        panelClassName="bg-[#131314] border-t border-white/10">
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Title"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
          />
          <textarea
            placeholder="What would you like to share with the team?"
            value={form.body}
            onChange={e => setForm({ ...form, body: e.target.value })}
            rows={4}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/40 resize-none focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
          />
          {isCoach && !editingId ? (
            <select
              value={form.training_group_id}
              onChange={e => setForm({ ...form, training_group_id: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
            >
              <option value="" className="bg-[#1c1b1c]">All athletes (global)</option>
              {groups.map(g => (
                <option key={g.id} value={g.id} className="bg-[#1c1b1c]">{g.name}</option>
              ))}
            </select>
          ) : !isCoach ? (
            <p className="text-xs text-white/60">
              Posting to{' '}
              <span className="font-semibold text-white/80">
                {groups.find(g => g.id === user?.training_group_id)?.name || 'your group'}
              </span>
            </p>
          ) : null}
          <button
            onClick={handleCreate}
            disabled={saving || !form.title.trim() || !form.body.trim()}
            style={{ boxShadow: '0 0 20px rgba(192,193,255,0.3)' }}
            className="w-full bg-[#c0c1ff] text-[#1000a9] rounded-full py-3 text-sm font-bold hover:scale-[1.01] active:scale-95 disabled:opacity-40 transition"
          >
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Post'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
