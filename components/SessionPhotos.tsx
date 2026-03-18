'use client';
import { useState, useRef } from 'react';
import { ImagePlus, FileText, Loader2 } from 'lucide-react';

interface MediaItem {
  id: string;
  file_url: string;
  mime_type: string;
  created_at: string;
}

interface Props {
  sessionId: string;
  initialPhotos: MediaItem[];
}

export function SessionPhotos({ sessionId, initialPhotos }: Props) {
  const [photos, setPhotos] = useState<MediaItem[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    setUploadMsg(null);
    const added: MediaItem[] = [];
    let failed = 0;

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sessionId);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        failed++;
        continue;
      }
      const { url } = await res.json();
      added.push({
        id: `${Date.now()}-${file.name}`,
        file_url: url,
        mime_type: file.type,
        created_at: new Date().toISOString(),
      });
    }

    setPhotos((prev) => [...prev, ...added]);
    setUploading(false);

    if (failed > 0 && added.length === 0) {
      setUploadMsg({ type: 'err', text: 'Не удалось загрузить файл' });
    } else if (added.length > 0) {
      setUploadMsg({
        type: 'ok',
        text: added.length === 1 ? 'Фото добавлено' : `Добавлено ${added.length} файла`,
      });
      setTimeout(() => setUploadMsg(null), 3000);
    }

    // reset file input
    if (fileRef.current) fileRef.current.value = '';
  };

  const isImage = (mime: string) => mime.startsWith('image/');

  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium">Фотографии и файлы</h3>
          {photos.length > 0 && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {photos.length} {photos.length === 1 ? 'файл' : photos.length < 5 ? 'файла' : 'файлов'}
            </p>
          )}
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all disabled:opacity-50"
          style={{
            background: 'var(--accent-dim)',
            color: 'var(--accent)',
            border: '1px solid var(--accent-border)',
          }}
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ImagePlus className="w-3.5 h-3.5" />
          )}
          {uploading ? 'Загрузка...' : 'Добавить фото'}
        </button>
      </div>

      <input
        type="file"
        ref={fileRef}
        className="hidden"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt"
        onChange={(e) => e.target.files && handleUpload(e.target.files)}
      />

      {/* Upload feedback */}
      {uploadMsg && (
        <p
          className="text-xs mb-3 px-3 py-2 rounded-lg"
          style={{
            background:
              uploadMsg.type === 'ok'
                ? 'rgba(212,168,83,0.1)'
                : 'rgba(220,80,60,0.1)',
            color: uploadMsg.type === 'ok' ? 'var(--accent)' : '#e05040',
            border: `1px solid ${uploadMsg.type === 'ok' ? 'var(--accent-border)' : 'rgba(220,80,60,0.25)'}`,
          }}
        >
          {uploadMsg.text}
        </p>
      )}

      {/* Photo grid */}
      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((item) =>
            isImage(item.mime_type) ? (
              <a
                key={item.id}
                href={item.file_url}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.file_url}
                  alt=""
                  className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                />
              </a>
            ) : (
              <a
                key={item.id}
                href={item.file_url}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center justify-center gap-1.5 aspect-square rounded-xl transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                }}
              >
                <FileText className="w-5 h-5" />
                <span className="text-xs truncate w-full text-center px-2">
                  {item.file_url.split('/').pop()?.split('?')[0] ?? 'файл'}
                </span>
              </a>
            )
          )}
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full py-8 rounded-xl text-sm text-center transition-colors"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: `1px dashed var(--border)`,
            color: 'var(--text-muted)',
          }}
        >
          Нажмите, чтобы добавить фотографии к этому воспоминанию
        </button>
      )}
    </section>
  );
}
