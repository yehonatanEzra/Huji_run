import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { forgotPassword, resetPassword } from '../api/auth';

const INPUT = 'w-full bg-white/10 border border-white/25 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/15 transition';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1); // 1 = email, 2 = code + new password
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setStep(2);
      setCooldown(60);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        setError('Please wait before requesting another code');
        setCooldown(60);
      } else {
        setError(err.response?.data?.detail || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email, code, newPassword);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ backgroundImage: 'url(/bg-login.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="fixed inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/85 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center min-h-dvh px-4">
        <div className="text-center pt-14">
          <h1 className="text-6xl font-black text-white tracking-tight [text-shadow:0_2px_20px_rgba(0,0,0,0.7)] leading-none">
            HUJI RUN
          </h1>
        </div>

        <div className="flex-1" />

        <div className="w-full max-w-sm pb-10">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-0.5">Reset password</h2>
            <p className="text-white/45 text-xs mb-4">
              {step === 1 ? "Enter your email and we'll send a reset code" : `Code sent to ${email}`}
            </p>

            {success && (
              <div className="bg-green-500/20 border border-green-400/35 rounded-xl px-4 py-2.5 mb-4">
                <p className="text-green-200 text-sm">Password updated! Redirecting to login…</p>
              </div>
            )}

            {error && (
              <div className="bg-red-500/20 border border-red-400/35 rounded-xl px-4 py-2.5 mb-4">
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}

            {step === 1 ? (
              <form onSubmit={handleRequestReset} className="space-y-3">
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={INPUT}
                />
                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-600 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
                  >
                    {loading ? 'Sending…' : 'Send Reset Code'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleReset} className="space-y-3">
                <input
                  type="text"
                  placeholder="6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={INPUT}
                />
                <input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className={INPUT}
                />
                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={loading || success}
                    className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-600 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
                  >
                    {loading ? 'Resetting…' : 'Reset Password'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setStep(1); setError(''); }}
                  className="w-full text-center text-xs text-white/40 hover:text-white/60 transition pt-1"
                >
                  Back / change email
                </button>
              </form>
            )}

            <p className="text-center text-xs text-white/40 mt-4">
              <Link to="/login" className="text-white font-semibold hover:underline">
                Back to Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
