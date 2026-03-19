'use client';
import { useState, useEffect } from 'react';
import { Loader2, Headphones, Download } from 'lucide-react';

export function AudioPlayer({ sessionId, shortTitle }: { sessionId: string; shortTitle?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/session/audio?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((d: { url?: string | null }) => { setUrl(d.url ?? null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Проверка аудиозаписи…
      </div>
    );
  }

  if (!url) return null;

  const filename = `${(shortTitle ?? 'разговор').replace(/[\\/:*?"<>|]/g, '')}.webm`;

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
          <Headphones className="w-4 h-4" />
          Аудиозапись разговора
        </div>
        <a
          href={url}
          download={filename}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          <Download className="w-3.5 h-3.5" />
          Скачать
        </a>
      </div>

      <audio
        controls
        src={url}
        className="w-full"
        style={{ accentColor: 'var(--accent)' }}
      />
    </div>
  );
}
