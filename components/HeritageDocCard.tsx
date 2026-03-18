'use client';
import React, { useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';

interface Doc {
  id: string;
  filename: string;
  file_url: string;
  summary_text: string | null;
}

export function HeritageDocCard({ doc: initialDoc }: { doc: Doc }) {
  const [doc, setDoc] = useState(initialDoc);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prepare = async () => {
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch('/api/heritage/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Ошибка обработки');
      setDoc((prev) => ({ ...prev, summary_text: data.summary }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setProcessing(false);
    }
  };

  const isReady = !!doc.summary_text;

  return (
    <div
      className="rounded-xl px-4 py-3.5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Filename link */}
        <a
          href={doc.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-0 text-sm flex items-center gap-1.5 hover:underline truncate"
          style={{ color: 'var(--text)' }}
        >
          <span className="truncate">{doc.filename}</span>
          <ExternalLink className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        </a>

        {/* Status + action */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {isReady && !processing && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Готов для AI
            </span>
          )}

          {!isReady && !processing && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Circle className="w-3.5 h-3.5" />
              Не обработан
            </span>
          )}

          <button
            onClick={prepare}
            disabled={processing}
            title={isReady ? 'Переобработать документ' : 'Подготовить для AI'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-50"
            style={{
              color: 'var(--text)',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid var(--border)',
            }}
          >
            {processing ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" />Обработка…</>
            ) : isReady ? (
              <><RefreshCw className="w-3.5 h-3.5" />Обновить</>
            ) : (
              <><RefreshCw className="w-3.5 h-3.5" />Подготовить</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs mt-2 truncate" style={{ color: '#e05040' }} title={error}>
          {error}
        </p>
      )}
    </div>
  );
}
