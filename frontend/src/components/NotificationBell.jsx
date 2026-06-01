import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { listNotifications, getUnreadCount, markRead, markAllRead } from '../api/notifications';

const TYPE_ICON = {
  new_workout: '🏋️',
  personal_workout: '🎯',
  workout_comment: '💬',
  new_race: '🏁',
  post_comment: '💭',
};

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const refreshCount = async () => {
    try {
      const { data } = await getUnreadCount();
      setUnread(data.unread);
    } catch { /* ignored */ }
  };

  // Initial fetch + polling
  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 30000);
    return () => clearInterval(t);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const openDropdown = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const { data } = await listNotifications();
      setItems(data);
    } catch { /* ignored */ }
    finally { setLoading(false); }
  };

  const handleClickItem = async (n) => {
    if (!n.read) {
      try { await markRead(n.id); } catch { /* ignored */ }
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnread(c => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = async () => {
    try {
      await markAllRead();
      setItems(prev => prev.map(x => ({ ...x, read: true })));
      setUnread(0);
    } catch { /* ignored */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => open ? setOpen(false) : openDropdown()}
        className="relative text-white/85 hover:text-white transition"
        aria-label="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-blue-950/95 backdrop-blur-lg border border-white/20 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <p className="text-sm font-semibold text-white">Notifications</p>
            {items.some(n => !n.read) && (
              <button onClick={handleMarkAll} className="text-xs text-blue-300 hover:text-blue-200 transition">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-white/50 italic px-3 py-6 text-center">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-white/50 italic px-3 py-6 text-center">No notifications yet</p>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClickItem(n)}
                  className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition flex gap-2.5 ${
                    n.read ? 'opacity-60' : ''
                  }`}
                >
                  <span className="text-lg shrink-0">{TYPE_ICON[n.type] || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white leading-tight">{n.message}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0 mt-1.5" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
