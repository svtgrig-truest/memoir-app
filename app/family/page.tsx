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
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-white text-2xl font-semibold text-center mb-8">
          Семейный архив
        </h1>
        <form onSubmit={handleLogin} className="bg-zinc-900 rounded-2xl p-6 space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            className="w-full bg-white/10 text-white rounded-xl px-4 py-3 outline-none placeholder-white/30 border border-white/10 focus:border-white/30 transition-colors"
            autoComplete="current-password"
            required
          />
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-3 font-medium transition-colors"
          >
            {loading ? 'Входим...' : 'Войти'}
          </button>
        </form>
      </div>
    </main>
  );
}
