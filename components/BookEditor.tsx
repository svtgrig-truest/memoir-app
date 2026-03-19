'use client';
import { useState, useEffect, useRef } from 'react';
import { Download, Loader2 } from 'lucide-react';
import Link from 'next/link';

export function BookEditor({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch('/api/export/book')
      .then((r) => {
        if (!r.ok) throw new Error('Ошибка загрузки');
        return r.text();
      })
      .then((t) => { setText(t); setLoading(false); })
      .catch(() => { setError('Не удалось загрузить текст'); setLoading(false); });
  }, []);

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'memoir.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* Toolbar */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 gap-4"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        <Link
          href={backHref}
          className="text-sm transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          ← {backLabel}
        </Link>

        <span
          className="text-sm font-medium tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          Вся книга
        </span>

        <button
          onClick={download}
          disabled={loading || !!error}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl transition-all disabled:opacity-40"
          style={{
            background: 'var(--accent-dim)',
            color: 'var(--accent)',
            border: '1px solid var(--accent-border)',
          }}
        >
          <Download className="w-4 h-4" />
          Скачать .txt
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4">
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2
              className="w-6 h-6 animate-spin"
              style={{ color: 'var(--text-muted)' }}
            />
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 w-full resize-none outline-none rounded-2xl p-6 text-sm leading-relaxed font-mono"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              minHeight: 'calc(100vh - 120px)',
            }}
            spellCheck={false}
          />
        )}
      </div>
    </main>
  );
}
