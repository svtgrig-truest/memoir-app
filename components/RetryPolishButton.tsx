'use client';
import { useState } from 'react';
import { RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';

export function RetryPolishButton({ transcriptId }: { transcriptId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const retry = async () => {
    setState('loading');
    try {
      const res = await fetch('/api/transcript/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript_id: transcriptId }),
      });
      if (!res.ok) throw new Error('failed');
      setState('done');
      // Refresh page to show new polished text
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <span className="flex items-center gap-1.5 text-sm flex-shrink-0" style={{ color: 'var(--accent)' }}>
        <CheckCircle2 className="w-4 h-4" /> Готово
      </span>
    );
  }

  return (
    <button
      onClick={retry}
      disabled={state === 'loading'}
      className="flex-shrink-0 flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl transition-opacity disabled:opacity-50"
      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', color: 'var(--text)' }}
    >
      {state === 'loading' ? (
        <><Loader2 className="w-4 h-4 animate-spin" />Обрабатываю…</>
      ) : (
        <><RefreshCw className="w-4 h-4" />{state === 'error' ? 'Ошибка, повторить' : 'Обработать'}</>
      )}
    </button>
  );
}
