'use client';
import { useState } from 'react';

interface Props {
  rawText: string;
  polishedText: string;
}

export function TranscriptViewer({ rawText, polishedText }: Props) {
  const [view, setView] = useState<'raw' | 'polished' | 'split'>('split');

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['raw', 'polished', 'split'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              view === v ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/60 hover:text-white'
            }`}
          >
            {v === 'raw' ? 'Транскрипт' : v === 'polished' ? 'Мемуар' : 'Оба'}
          </button>
        ))}
      </div>

      <div className={`grid gap-4 ${view === 'split' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {(view === 'raw' || view === 'split') && (
          <div className="bg-zinc-900 rounded-xl p-4">
            <h3 className="text-white/50 text-xs uppercase mb-3">Оригинальный транскрипт</h3>
            <pre className="text-white/80 text-sm whitespace-pre-wrap font-sans leading-relaxed">
              {rawText}
            </pre>
          </div>
        )}
        {(view === 'polished' || view === 'split') && (
          <div className="bg-zinc-900 rounded-xl p-4">
            <h3 className="text-white/50 text-xs uppercase mb-3">Литературная версия</h3>
            <p className="text-white text-sm leading-relaxed">{polishedText}</p>
          </div>
        )}
      </div>
    </div>
  );
}
