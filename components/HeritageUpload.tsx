'use client';
import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';

export function HeritageUpload() {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/heritage', { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      setMessage('Документ загружен и обработан');
      // Brief delay so user sees the success message before reload
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setMessage(`Ошибка: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        ref={fileRef}
        className="hidden"
        accept=".txt,.pdf,.doc,.docx"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm text-white/70 hover:text-white transition-colors disabled:opacity-50"
      >
        <Upload className="w-4 h-4" />
        {uploading ? 'Обработка...' : 'Загрузить документ'}
      </button>
      {message && <p className="text-sm mt-2 text-white/50">{message}</p>}
    </div>
  );
}
