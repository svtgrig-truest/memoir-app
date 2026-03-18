'use client';
import React, { useState } from 'react';
import { CheckCircle2, Clock, ExternalLink, RefreshCw } from 'lucide-react';

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

  const reprocess = async () => {
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

  return (
    <div
      className="rounded-xl px-4 py-3.5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <a
            href={doc.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm flex items-center gap-1.5 hover:underline break-all"
            style={{ color: 'var(--text)' }}
          >
            {doc.filename}
            <ExternalLink
              className="w-3 h-3 flex-shrink-0"
              style={{ color: 'var(--text-muted)' }}
            />
          </a>
          {doc.summary_text && (
            <p
              className="text-xs mt-2 leading-relaxed line-clamp-3"
              style={{ color: 'var(--text-muted)' }}
            >
              {doc.summary_text}
            </p>
          )}
          {error && (
            <p className="text-xs mt-1" style={{ color: '#e05040' }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          {doc.summary_text && !processing && (
            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
          )}

          <button
            onClick={reprocess}
            disabled={processing}
            title="Переизвлечь полный текст"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{
              color: processing ? 'var(--text-muted)' : 'var(--text)',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid var(--border)',
            }}
          >
            {processing ? (
              <>
                <Clock className="w-3.5 h-3.5 animate-spin" />
                Обработка…
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                {doc.summary_text ? 'Обновить' : 'Обработать'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
