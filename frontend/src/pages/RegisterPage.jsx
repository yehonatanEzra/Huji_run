import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register as registerApi, requestCode } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';

const INPUT = 'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition';

export default function RegisterPage() {
  const [step, setStep] = useState(1); // 1 = email, 2 = full form
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({ first_name: '', last_name: '', username: '', password: '', code: '', gender: 'M', role: 'athlete' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0); // seconds remaining before resend allowed
  const { login } = useAuth();
  const navigate = useNavigate();

  // Count down the resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestCode(email, 'register');
      setStep(2);
      setCooldown(60);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        setError('Please wait a moment before requesting another code');
        setCooldown(60);
      } else {
        setError(err.response?.data?.detail || 'Failed to send code');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError('');
    setLoading(true);
    try {
      await requestCode(email, 'register');
      setCooldown(60);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

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
        email,
        code: form.code,
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
    <div className="min-h-dvh overflow-y-auto">
      <div className="fixed inset-0 z-0">
        <img src="/bg-login.jpg" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/80" />
      </div>

      <main className="relative z-10 min-h-dvh flex flex-col items-center px-6 py-12 text-white">
        <header className="text-center mt-4">
          <h1 className="text-6xl font-black tracking-tight [text-shadow:0_2px_20px_rgba(0,0,0,0.6)]">HUJI RUN</h1>
        </header>

        <section className="w-full max-w-md mt-24 sm:mt-32 rounded-lg p-8 shadow-2xl border border-white/10 bg-[#1c1b1c]/35 backdrop-blur-xl">
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-1">Join the team</h2>
            <p className="text-sm text-white/60">
              {step === 1 ? 'Enter your email to get started' : 'Verify your email and set up your account'}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-400/35 bg-red-500/20 px-4 py-2.5">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={INPUT}
              />
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 rounded-lg transition shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                >
                  {loading ? 'Sending code…' : 'Send Verification Code'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email + code */}
              <div className="space-y-2 p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-xs text-white/50">Code sent to <span className="text-white/80 font-medium">{email}</span></p>
                <input
                  type="text"
                  placeholder="6-digit code"
                  value={form.code}
                  onChange={update('code')}
                  required
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={INPUT}
                />
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0 || loading}
                  className="text-xs text-indigo-300 hover:text-indigo-200 disabled:opacity-40 transition"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>

              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="First name" value={form.first_name} onChange={update('first_name')} required className={INPUT} />
                <input type="text" placeholder="Last name" value={form.last_name} onChange={update('last_name')} required className={INPUT} />
              </div>

              <input type="text" placeholder="Username" value={form.username} onChange={update('username')} required autoComplete="username" className={INPUT} />
              <input type="password" placeholder="Password" value={form.password} onChange={update('password')} required autoComplete="new-password" className={INPUT} />

              {/* Gender toggle */}
              <div className="flex p-1 bg-white/5 border border-white/10 rounded-lg">
                {[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }].map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => setForm({ ...form, gender: value })}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${form.gender === value ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
                  >{label}</button>
                ))}
              </div>

              {/* Role toggle */}
              <div className="space-y-2 pt-2">
                <p className="text-[10px] font-bold tracking-widest uppercase text-white/50 ml-1">I want to join as</p>
                <div className="flex p-1 bg-white/5 border border-white/10 rounded-lg">
                  {[{ value: 'athlete', label: 'Athlete' }, { value: 'coach', label: 'Coach' }].map(({ value, label }) => (
                    <button key={value} type="button" onClick={() => setForm({ ...form, role: value })}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${form.role === value ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 rounded-lg transition shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                >
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>
              </div>
            </form>
          )}

          <p className="mt-8 text-center text-sm">
            <span className="text-white/60">Already have an account?</span>
            <Link to="/login" className="font-bold hover:underline ml-1">Sign In</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
