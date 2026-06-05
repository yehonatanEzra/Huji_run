import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register as registerApi } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import { NoiseBackground } from '../components/ui/NoiseBackground';

const GLASS_INPUT = 'w-full bg-white/10 border border-white/25 rounded-xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/15 transition';

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
    <div
      className="min-h-dvh flex flex-col"
      style={{ backgroundImage: 'url(/bg-login.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="fixed inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/85 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center min-h-dvh px-4">

        {/* Branding */}
        <div className="text-center pt-12">
          <p className="text-[11px] font-bold tracking-[0.35em] text-white/55 uppercase mb-2">
            Hebrew University
          </p>
          <h1 className="text-5xl font-black text-white tracking-tight [text-shadow:0_2px_20px_rgba(0,0,0,0.7)] leading-none">
            HUJI RUN
          </h1>
          <div className="flex items-center justify-center gap-3 mt-3">
            <div className="h-px w-10 bg-white/30" />
            <span className="text-[10px] text-white/50 tracking-[0.3em] uppercase font-medium">Running Club</span>
            <div className="h-px w-10 bg-white/30" />
          </div>
        </div>

        {/* Photo fills this space */}
        <div className="flex-1" />

        {/* Form pinned to bottom */}
        <div className="w-full max-w-sm pb-10">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-1">Join the team</h2>
            <p className="text-white/45 text-sm mb-5">Create your account</p>

            {error && (
              <div className="bg-red-500/20 border border-red-400/35 rounded-xl px-4 py-2.5 mb-4">
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="First name"
                  value={form.first_name}
                  onChange={update('first_name')}
                  required
                  className={GLASS_INPUT}
                />
                <input
                  type="text"
                  placeholder="Last name"
                  value={form.last_name}
                  onChange={update('last_name')}
                  required
                  className={GLASS_INPUT}
                />
              </div>
              <input
                type="text"
                placeholder="Username"
                value={form.username}
                onChange={update('username')}
                required
                autoComplete="username"
                className={GLASS_INPUT}
              />
              <input
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={update('password')}
                required
                autoComplete="new-password"
                className={GLASS_INPUT}
              />

              {/* Gender */}
              <div className="flex rounded-xl overflow-hidden border border-white/20 bg-white/5">
                {[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, gender: value })}
                    className={`flex-1 py-2.5 text-sm font-semibold transition ${
                      form.gender === value ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                    }`}
                  >{label}</button>
                ))}
              </div>

              {/* Role */}
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/45 font-semibold mb-2">I want to join as</p>
                <div className="flex rounded-xl overflow-hidden border border-white/20 bg-white/5">
                  {[{ value: 'athlete', label: 'Athlete' }, { value: 'coach', label: 'Coach' }].map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, role: value })}
                      className={`flex-1 py-2.5 text-sm font-semibold transition ${
                        form.role === value ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              <div className="pt-1">
                <NoiseBackground
                  containerClassName="w-full rounded-xl p-[2px]"
                  gradientColors={['rgb(37,99,235)', 'rgb(99,102,241)', 'rgb(139,92,246)']}
                >
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-[10px] bg-black/70 hover:bg-black/55 backdrop-blur-sm py-3 text-sm font-semibold tracking-wide text-white transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {loading ? 'Creating account…' : 'Create Account'}
                  </button>
                </NoiseBackground>
              </div>
            </form>

            <p className="text-center text-sm text-white/40 mt-5">
              Already have an account?{' '}
              <Link to="/login" className="text-white font-semibold hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
