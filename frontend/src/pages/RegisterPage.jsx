import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register as registerApi } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';

export default function RegisterPage() {
  const [form, setForm] = useState({ first_name: '', last_name: '', username: '', password: '', gender: 'M', role: 'athlete' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        full_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
        username: form.username,
        password: form.password,
        gender: form.gender,
        role: form.role,
      };
      const { data } = await registerApi(payload);
      login(data);
      // Athletes start unpaired → go pick a coach. Coaches go to their dashboard.
      if (data.role === 'coach' || data.role === 'admin') {
        navigate('/coach/dashboard');
      } else {
        navigate('/find-coach');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center text-blue-700 mb-2">Huji Run</h1>
        <p className="text-center text-gray-500 mb-8">Join The Team</p>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Create Account</h2>

          {error && <p className="text-red-500 text-sm bg-red-50 rounded p-2">{error}</p>}

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="First Name"
              value={form.first_name}
              onChange={update('first_name')}
              required
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Last Name"
              value={form.last_name}
              onChange={update('last_name')}
              required
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <input
            type="text"
            placeholder="Username"
            value={form.username}
            onChange={update('username')}
            required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={update('password')}
            required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={form.gender}
            onChange={update('gender')}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>

          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">I want to join as</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, role: 'athlete' })}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                  form.role === 'athlete'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                🏃 Athlete
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, role: 'coach' })}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                  form.role === 'coach'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                📋 Coach
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Account'}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 hover:underline">Sign In</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
