import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login as loginApi } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import { NoiseBackground } from '../components/ui/NoiseBackground';

const GLASS_INPUT = 'w-full bg-white/10 border border-white/25 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/15 transition';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await loginApi(username, password);
      login(data);
      navigate('/calendar');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ backgroundImage: 'url(/bg-login.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* Gradient: transparent at top (photo shows), darkens toward bottom where the form sits */}
      <div className="fixed inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/85 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center min-h-dvh px-4">

        {/* Branding — top of the photo */}
        <div className="text-center pt-14">
          <p className="text-[11px] font-bold tracking-[0.35em] text-white/55 uppercase mb-3">
            Push Your Limits
          </p>
          <h1 className="text-6xl font-black text-white tracking-tight [text-shadow:0_2px_20px_rgba(0,0,0,0.7)] leading-none">
            HUJI RUN
          </h1>
          <div className="flex items-center justify-center gap-3 mt-4">
            <div className="h-px w-10 bg-white/30" />
            <span className="text-[10px] text-white/50 tracking-[0.3em] uppercase font-medium">Running Club</span>
            <div className="h-px w-10 bg-white/30" />
          </div>
        </div>

        {/* Photo fills this space */}
        <div className="flex-1" />

        {/* Form pinned to bottom */}
        <div className="w-full max-w-sm pb-10">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-0.5">Welcome back</h2>
            <p className="text-white/45 text-xs mb-4">Sign in to your account</p>

            {error && (
              <div className="bg-red-500/20 border border-red-400/35 rounded-xl px-4 py-2.5 mb-4">
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className={GLASS_INPUT}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={GLASS_INPUT}
              />

              <div className="pt-1">
                <NoiseBackground
                  containerClassName="w-full rounded-xl p-[2px]"
                  gradientColors={['rgb(37,99,235)', 'rgb(99,102,241)', 'rgb(139,92,246)']}
                >
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-[10px] bg-black/70 hover:bg-black/55 backdrop-blur-sm py-2.5 text-sm font-semibold tracking-wide text-white transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {loading ? 'Signing in…' : 'Sign In'}
                  </button>
                </NoiseBackground>
              </div>
            </form>

            <p className="text-center text-xs text-white/40 mt-4">
              No account yet?{' '}
              <Link to="/register" className="text-white font-semibold hover:underline">
                Register
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
