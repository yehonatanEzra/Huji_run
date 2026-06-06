import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { createTeam } from '../../api/teams';

export default function TeamSetupPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', sport: '', location: '', description: '' });
  const [nameError, setNameError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (user?.role !== 'coach' && user?.role !== 'admin') {
    navigate('/home', { replace: true });
    return null;
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setNameError('');
    setError('');

    if (!form.name.trim()) {
      setNameError('Team name is required');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await createTeam({
        name: form.name.trim(),
        sport: form.sport.trim() || null,
        location: form.location.trim() || null,
        description: form.description.trim() || null,
      });
      // Store the new token (active_team_id set to the new team)
      login({ ...data, user_id: user.id, role: user.role, full_name: user.full_name, access_token: data.access_token });
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create team');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Create your team</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Team Name <span className="text-red-500">*</span>
          </label>
          <input
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.name}
            onChange={set('name')}
            placeholder="e.g. Hebrew University Track Club"
            maxLength={100}
          />
          {nameError && <p className="text-red-500 text-sm mt-1">{nameError}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Sport / Discipline</label>
          <input
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.sport}
            onChange={set('sport')}
            placeholder="e.g. Track & Field"
            maxLength={80}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Location (city)</label>
          <input
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.location}
            onChange={set('location')}
            placeholder="e.g. Jerusalem"
            maxLength={80}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            value={form.description}
            onChange={set('description')}
            rows={3}
            placeholder="Tell athletes about your team…"
            maxLength={500}
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
        >
          {submitting ? 'Creating…' : 'Create Team'}
        </button>
      </form>
    </div>
  );
}
