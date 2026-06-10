import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

const SPECIALTIES = [
  'Physiotherapist',
  'Masseuse',
  'Chiropractor',
  'Orthopedist',
  'Sports Doctor',
  'Nutritionist',
  'Other',
];

const GLASS = 'bg-[#201f20]/60 backdrop-blur-2xl border border-white/10';
const GLASS_INPUT = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20';

function StarRating({ value, onChange, size = 'md' }) {
  const [hovered, setHovered] = useState(0);
  const sizeClass = size === 'sm' ? 'text-base' : 'text-2xl';
  return (
    <div className={`flex gap-0.5 ${sizeClass}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange && onChange(star)}
          onMouseEnter={() => onChange && setHovered(star)}
          onMouseLeave={() => onChange && setHovered(0)}
          className={`transition-colors ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <span className={(hovered || value) >= star ? 'text-yellow-400' : 'text-white/25'}>★</span>
        </button>
      ))}
    </div>
  );
}

function ReviewsModal({ professional, onClose }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [editingReview, setEditingReview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/health-wellness/${professional.id}/reviews`);
      setReviews(res.data);
    } finally {
      setLoading(false);
    }
  }, [professional.id]);

  useEffect(() => { load(); }, [load]);

  const myReview = reviews.find((r) => r.user_id === user.id);

  async function submitReview(e) {
    e.preventDefault();
    if (!rating) return;
    setSubmitting(true);
    setReviewError('');
    try {
      await api.post(`/health-wellness/${professional.id}/reviews`, {
        rating,
        comment: comment.trim() || null,
      });
      setRating(0);
      setComment('');
      load();
    } catch (err) {
      setReviewError(
        err.response?.status === 409
          ? 'You have already reviewed this professional.'
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editingReview.rating) return;
    setSubmitting(true);
    setReviewError('');
    try {
      await api.put(`/health-wellness/${professional.id}/reviews/${editingReview.id}`, {
        rating: editingReview.rating,
        comment: editingReview.comment?.trim() || null,
      });
      setEditingReview(null);
      load();
    } catch {
      setReviewError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} panelClassName="bg-[#131314] border-t border-white/10">
      <h2 className="text-lg font-bold text-white mb-0.5">{professional.name}</h2>
      <p className="text-sm text-white/50 mb-4">{professional.specialty} · {professional.city}</p>

      {editingReview ? (
        <form onSubmit={saveEdit} className={`${GLASS} rounded-xl p-3 mb-4 space-y-2`}>
          <p className="text-sm font-semibold text-white">Edit your review</p>
          {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
          <StarRating value={editingReview.rating} onChange={(v) => setEditingReview((r) => ({ ...r, rating: v }))} />
          <textarea
            value={editingReview.comment ?? ''}
            onChange={(e) => setEditingReview((r) => ({ ...r, comment: e.target.value }))}
            placeholder="Share your experience (optional)"
            rows={2}
            className={GLASS_INPUT}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={!editingReview.rating || submitting}
              className="bg-[#c0c1ff] text-[#1000a9] text-sm px-4 py-1.5 rounded-lg font-semibold disabled:opacity-40">
              {submitting ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditingReview(null)}
              className="text-sm text-white/60 px-4 py-1.5 rounded-lg border border-white/20 hover:text-white transition">
              Cancel
            </button>
          </div>
        </form>
      ) : myReview ? (
        <div className={`${GLASS} rounded-xl p-3 mb-4`}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-white">Your review</p>
            <button onClick={() => setEditingReview({ ...myReview })}
              className="text-xs text-[#c0c1ff] hover:text-white underline transition">
              Edit
            </button>
          </div>
          <StarRating value={myReview.rating} size="sm" />
          {myReview.comment && <p className="text-sm text-white/70 mt-1">{myReview.comment}</p>}
        </div>
      ) : (
        <form onSubmit={submitReview} className={`${GLASS} rounded-xl p-3 mb-4 space-y-2`}>
          <p className="text-sm font-semibold text-white">Leave a rating</p>
          {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}
          <StarRating value={rating} onChange={setRating} />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your experience (optional)"
            rows={2}
            className={GLASS_INPUT}
          />
          <button type="submit" disabled={!rating || submitting}
            className="bg-[#c0c1ff] text-[#1000a9] text-sm px-4 py-1.5 rounded-lg font-semibold disabled:opacity-40">
            {submitting ? 'Submitting…' : 'Submit rating'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-white/40 text-center py-4 italic">No reviews yet. Be the first!</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {reviews.map((r) => (
            <div key={r.id} className="border-b border-white/10 pb-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{r.reviewer_name}</span>
                <StarRating value={r.rating} size="sm" />
              </div>
              {r.comment && <p className="text-sm text-white/65 mt-0.5">{r.comment}</p>}
              <p className="text-xs text-white/35 mt-0.5">{new Date(r.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ProfessionalForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    specialty: initial?.specialty ?? SPECIALTIES[0],
    city: initial?.city ?? '',
    phone: initial?.phone ?? '',
    price: initial?.price ?? '',
    notes: initial?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await onSave({
        ...form,
        price: form.price.trim() || null,
        notes: form.notes.trim() || null,
      });
    } catch (err) {
      setFormError(err?.response?.data?.detail || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const label = (text) => <label className="block text-[10px] uppercase tracking-wider text-white/50 font-semibold mb-1">{text}</label>;

  return (
    <Modal open onClose={onClose} panelClassName="bg-[#131314] border-t border-white/10">
      <h2 className="text-lg font-bold text-white mb-4">
        {initial ? 'Edit Professional' : 'Add Professional'}
      </h2>
      {formError && <p className="text-sm text-red-400 mb-3">{formError}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          {label('Full Name *')}
          <input required value={form.name} onChange={set('name')} className={GLASS_INPUT} />
        </div>
        <div>
          {label('Specialty *')}
          <select required value={form.specialty} onChange={set('specialty')} className={GLASS_INPUT}>
            {SPECIALTIES.map((s) => <option key={s} className="bg-[#1c1b1c]">{s}</option>)}
          </select>
        </div>
        <div>
          {label('City *')}
          <input required value={form.city} onChange={set('city')} className={GLASS_INPUT} />
        </div>
        <div>
          {label('Phone *')}
          <input required value={form.phone} onChange={set('phone')} className={GLASS_INPUT} />
        </div>
        <div>
          {label('Price / Fee (optional)')}
          <input value={form.price} onChange={set('price')} placeholder="e.g. 200₪ / session" className={GLASS_INPUT} />
        </div>
        <div>
          {label('Notes (optional)')}
          <textarea value={form.notes} onChange={set('notes')} rows={2} className={`${GLASS_INPUT} resize-none`} />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving}
            className="flex-1 bg-[#c0c1ff] text-[#1000a9] text-sm py-2 rounded-lg font-semibold disabled:opacity-40">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 border border-white/25 text-white/70 text-sm py-2 rounded-lg hover:text-white transition">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProfessionalCard({ professional, canEdit, onEdit, onDelete, onReviews, expanded, onToggle }) {
  return (
    <div className={`${GLASS} rounded-2xl overflow-hidden transition-all duration-200`}>
      {/* Compact row — always visible, tap to expand */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">{professional.name}</p>
          <p className="text-xs text-white/50 mt-0.5">{professional.specialty}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center gap-1 justify-end">
            <span className="text-yellow-400 text-sm">★</span>
            <span className="text-sm font-semibold text-white">
              {professional.avg_rating ? professional.avg_rating.toFixed(1) : '—'}
            </span>
          </div>
          {professional.price && (
            <p className="text-xs text-white/55 mt-0.5 truncate max-w-[90px]">{professional.price}</p>
          )}
        </div>
        <span className={`text-white/35 text-lg leading-none transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>›</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-white/15">
          <div className="pt-3 space-y-2">
            <p className="text-xs text-white/45 uppercase tracking-wider">{professional.city}</p>
            <a
              href={`tel:${professional.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 text-sm text-[#c0c1ff] font-medium hover:text-white transition"
            >
              <span>📞</span><span>{professional.phone}</span>
            </a>
            {professional.notes && (
              <p className="text-sm text-white/65 flex items-start gap-2">
                <span className="mt-0.5"></span><span>{professional.notes}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={(e) => { e.stopPropagation(); onReviews(professional); }}
              className="flex-1 text-sm bg-white/10 border border-white/20 text-white py-1.5 rounded-lg hover:bg-white/20 transition"
            >
              ★ Reviews ({professional.review_count})
            </button>
            {canEdit && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(professional); }}
                  className="px-3 text-sm bg-white/10 border border-white/20 text-white/80 py-1.5 rounded-lg hover:bg-white/20 transition"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(professional); }}
                  className="px-3 text-sm bg-red-500/20 border border-red-400/30 text-red-300 py-1.5 rounded-lg hover:bg-red-500/30 transition"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HealthWellnessPage() {
  const { user } = useAuth();

  const [professionals, setProfessionals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [reviewTarget, setReviewTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (cityFilter.trim()) params.city = cityFilter.trim();
      if (specialtyFilter) params.specialty = specialtyFilter;
      const res = await api.get('/health-wellness', { params });
      setProfessionals(res.data);
    } finally {
      setLoading(false);
    }
  }, [cityFilter, specialtyFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(data) {
    await api.post('/health-wellness', data);
    setShowAddForm(false);
    load();
  }

  async function handleEdit(data) {
    await api.put(`/health-wellness/${editTarget.id}`, data);
    setEditTarget(null);
    load();
  }

  async function handleDelete(professional) {
    if (!window.confirm(`Remove ${professional.name} from the directory?`)) return;
    await api.delete(`/health-wellness/${professional.id}`);
    setExpandedId(null);
    load();
  }

  const cities = [...new Set(professionals.map((p) => p.city))].sort();

  return (
    <div className="space-y-4">
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: 'url(/bg-health.jpg)' }} />
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(19,19,20,0.55) 0%, rgba(19,19,20,0.88) 100%)' }} />

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">Directory</p>
          <h1 className="text-xl font-bold text-[#e5e2e3]">Health &amp; Wellness</h1>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          style={{ boxShadow: '0 0 15px rgba(192,193,255,0.3)' }}
          className="bg-[#c0c1ff] text-[#1000a9] text-sm px-4 py-1.5 rounded-full font-bold hover:scale-[1.02] active:scale-95 transition"
        >
          + Add
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
        >
          <option value="" className="bg-[#1c1b1c]">All Cities</option>
          {cities.map((c) => <option key={c} className="bg-[#1c1b1c]">{c}</option>)}
        </select>
        <select
          value={specialtyFilter}
          onChange={(e) => setSpecialtyFilter(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-[#c0c1ff] focus:ring-2 focus:ring-[#c0c1ff]/20"
        >
          <option value="" className="bg-[#1c1b1c]">All Specialties</option>
          {SPECIALTIES.map((s) => <option key={s} className="bg-[#1c1b1c]">{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : professionals.length === 0 ? (
        <div className="text-center py-16 text-white/40">
          <p className="text-4xl mb-2">🏥</p>
          <p className="font-medium text-white/60">No professionals found</p>
          <p className="text-sm mt-1">Be the first to add one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {professionals.map((p) => (
            <ProfessionalCard
              key={p.id}
              professional={p}
              canEdit={user?.role === 'admin' || p.created_by_id === user?.id}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onEdit={setEditTarget}
              onDelete={handleDelete}
              onReviews={setReviewTarget}
            />
          ))}
        </div>
      )}

      {showAddForm && (
        <ProfessionalForm onSave={handleAdd} onClose={() => setShowAddForm(false)} />
      )}
      {editTarget && (
        <ProfessionalForm initial={editTarget} onSave={handleEdit} onClose={() => setEditTarget(null)} />
      )}
      {reviewTarget && (
        <ReviewsModal professional={reviewTarget} onClose={() => setReviewTarget(null)} />
      )}
    </div>
  );
}
