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
          <span className={(hovered || value) >= star ? 'text-yellow-400' : 'text-gray-300'}>
            ★
          </span>
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

  async function submitReview(e) {
    e.preventDefault();
    if (!rating) return;
    setSubmitting(true);
    try {
      await api.post(`/health-wellness/${professional.id}/reviews`, {
        rating,
        comment: comment.trim() || null,
      });
      setRating(0);
      setComment('');
      load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose}>
      <h2 className="text-lg font-bold mb-1">{professional.name}</h2>
      <p className="text-sm text-gray-500 mb-4">{professional.specialty} · {professional.city}</p>

      <form onSubmit={submitReview} className="bg-gray-50 rounded-lg p-3 mb-4 space-y-2">
        <p className="text-sm font-semibold text-gray-700">Leave a rating</p>
        <StarRating value={rating} onChange={setRating} />
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience (optional)"
          rows={2}
          className="w-full text-sm border border-gray-300 rounded p-2 resize-none"
        />
        <button
          type="submit"
          disabled={!rating || submitting}
          className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded disabled:opacity-40"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No reviews yet. Be the first!</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {reviews.map((r) => (
            <div key={r.id} className="border-b border-gray-100 pb-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{r.reviewer_name}</span>
                <StarRating value={r.rating} size="sm" />
              </div>
              {r.comment && <p className="text-sm text-gray-600 mt-0.5">{r.comment}</p>}
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(r.created_at).toLocaleDateString()}
              </p>
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

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...form,
        price: form.price.trim() || null,
        notes: form.notes.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm';
  const label = (text) => <label className="block text-xs font-medium text-gray-600 mb-0.5">{text}</label>;

  return (
    <Modal open onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">
        {initial ? 'Edit Professional' : 'Add Professional'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          {label('Full Name *')}
          <input required value={form.name} onChange={set('name')} className={inputClass} />
        </div>
        <div>
          {label('Specialty *')}
          <select required value={form.specialty} onChange={set('specialty')} className={inputClass}>
            {SPECIALTIES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          {label('City *')}
          <input required value={form.city} onChange={set('city')} className={inputClass} />
        </div>
        <div>
          {label('Phone *')}
          <input required value={form.phone} onChange={set('phone')} className={inputClass} />
        </div>
        <div>
          {label('Price / Fee (optional)')}
          <input value={form.price} onChange={set('price')} placeholder="e.g. 200₪ / session" className={inputClass} />
        </div>
        <div>
          {label('Notes (optional)')}
          <textarea value={form.notes} onChange={set('notes')} rows={2} className={`${inputClass} resize-none`} />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 text-white text-sm py-2 rounded font-medium disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-sm py-2 rounded">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProfessionalCard({ professional, isCoach, onEdit, onDelete, onReviews }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{professional.name}</h3>
          <p className="text-sm text-blue-600 font-medium">{professional.specialty}</p>
          <p className="text-sm text-gray-500">{professional.city}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="flex items-center gap-1 justify-end">
            <span className="text-yellow-400 text-sm">★</span>
            <span className="text-sm font-semibold">
              {professional.avg_rating ? professional.avg_rating.toFixed(1) : '—'}
            </span>
          </div>
          <p className="text-xs text-gray-400">{professional.review_count} review{professional.review_count !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <a
          href={`tel:${professional.phone}`}
          className="flex items-center gap-2 text-sm text-blue-700 font-medium"
        >
          <span>📞</span>
          <span>{professional.phone}</span>
        </a>
        {professional.price && (
          <p className="text-sm text-gray-600 flex items-center gap-2">
            <span>💰</span>
            <span>{professional.price}</span>
          </p>
        )}
        {professional.notes && (
          <p className="text-sm text-gray-500 flex items-start gap-2">
            <span className="mt-0.5">📝</span>
            <span>{professional.notes}</span>
          </p>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onReviews(professional)}
          className="flex-1 text-sm border border-blue-200 text-blue-700 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
        >
          Reviews
        </button>
        {isCoach && (
          <>
            <button
              onClick={() => onEdit(professional)}
              className="px-3 text-sm border border-gray-200 text-gray-600 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(professional)}
              className="px-3 text-sm border border-red-200 text-red-600 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function HealthWellnessPage() {
  const { user } = useAuth();
  const isCoach = user?.role === 'coach';

  const [professionals, setProfessionals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');

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
    load();
  }

  const cities = [...new Set(professionals.map((p) => p.city))].sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Health & Wellness</h1>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg font-medium"
        >
          + Add
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
        >
          <option value="">All Cities</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select
          value={specialtyFilter}
          onChange={(e) => setSpecialtyFilter(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
        >
          <option value="">All Specialties</option>
          {SPECIALTIES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : professionals.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-2">🏥</p>
          <p className="font-medium">No professionals found</p>
          <p className="text-sm mt-1">Be the first to add one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {professionals.map((p) => (
            <ProfessionalCard
              key={p.id}
              professional={p}
              isCoach={isCoach}
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
