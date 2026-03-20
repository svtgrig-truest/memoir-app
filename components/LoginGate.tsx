'use client';
import { useState, useRef, useEffect } from 'react';

interface Props {
  onSuccess: () => void;
}

export function LoginGate({ onSuccess }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pin }),
      });
      if (res.ok) {
        onSuccess();
      } else {
        setError(true);
        setPin('');
        inputRef.current?.focus();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(212,168,83,0.07) 0%, transparent 70%)',
        }}
      />
      <div className="relative flex flex-col items-center gap-8 px-6 w-full max-w-sm">
        <div className="flex flex-col items-center gap-2">
          <span
            className="text-3xl font-semibold tracking-wide"
            style={{ color: 'var(--accent)' }}
          >
            Memoir
          </span>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Введите код доступа
          </span>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setError(false);
              setPin(e.target.value);
            }}
            placeholder="••••••"
            autoComplete="current-password"
            className="w-full text-center text-2xl tracking-widest rounded-xl px-4 py-4 outline-none transition-all"
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${error ? '#e05040' : 'var(--border)'}`,
              color: 'var(--text)',
              letterSpacing: '0.3em',
            }}
          />

          {error && (
            <p className="text-center text-sm" style={{ color: '#e05040' }}>
              Неверный код
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full py-4 rounded-xl text-base font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'var(--accent)',
              color: '#0d0b09',
            }}
          >
            {loading ? 'Проверяю...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
