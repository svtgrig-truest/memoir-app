'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FamilyLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/family-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/family/dashboard');
    } else {
      setError('Неверный пароль');
      setLoading(false);
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(212,168,83,0.05) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-xs">
        {/* Logo */}
        <div className="text-center mb-10">
          <span
            className="text-2xl font-semibold tracking-wide"
            style={{ color: 'var(--accent)' }}
          >
            Memoir
          </span>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Семейный архив
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-2xl p-6 space-y-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div>
            <label
              className="block text-xs uppercase tracking-widest mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: '#e05040' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-xl py-3 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              border: '1px solid var(--accent-border)',
            }}
            onMouseEnter={e => {
              if (!loading && password) e.currentTarget.style.background = 'rgba(212,168,83,0.2)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--accent-dim)';
            }}
          >
            {loading ? 'Входим...' : 'Войти'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-xs transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            ← Вернуться к записи
          </a>
        </div>
      </div>
    </main>
  );
}
