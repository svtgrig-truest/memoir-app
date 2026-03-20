'use client';
import { useState, useEffect } from 'react';
import { Loader2, Headphones, Download } from 'lucide-react';

export function AudioPlayer({ sessionId, shortTitle }: { sessionId: string; shortTitle?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch(`/api/session/audio?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((d: { url?: string | null }) => { setUrl(d.url ?? null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handleDownload = async () => {
    if (!url || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
      a.href = objectUrl;
      a.download = `${(shortTitle ?? 'разговор').replace(/[\\/:*?"<>|]/g, '')}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Проверка аудиозаписи…
      </div>
    );
  }

  if (!url) return null;

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
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: downloading ? 'var(--text-muted)' : 'var(--text-muted)',
            cursor: downloading ? 'wait' : 'pointer',
          }}
        >
          {downloading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Download className="w-3.5 h-3.5" />}
          {downloading ? 'Загружаю...' : 'Скачать'}
        </button>
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
