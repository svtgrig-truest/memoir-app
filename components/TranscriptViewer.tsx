'use client';
import { useState } from 'react';
import { BookOpen, MessageSquare, Columns2 } from 'lucide-react';

interface Props {
  rawText: string;
  polishedText: string;
}

type View = 'raw' | 'polished' | 'split';

const tabs: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'polished', label: 'История', icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: 'raw', label: 'Разговор', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { id: 'split', label: 'Оба', icon: <Columns2 className="w-3.5 h-3.5" /> },
];

export function TranscriptViewer({ rawText, polishedText }: Props) {
  const [view, setView] = useState<View>('polished');

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div
        className="inline-flex gap-1 p-1 rounded-xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all"
            style={
              view === tab.id
                ? {
                    background: 'var(--accent-dim)',
                    color: 'var(--accent)',
                    border: '1px solid var(--accent-border)',
                  }
                : {
                    color: 'var(--text-muted)',
                    border: '1px solid transparent',
                  }
            }
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={`grid gap-4 ${view === 'split' ? 'md:grid-cols-2 grid-cols-1' : 'grid-cols-1'}`}>
        {(view === 'polished' || view === 'split') && (
          <div
            className="rounded-2xl p-6"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p
              className="text-xs uppercase tracking-widest mb-4"
              style={{ color: 'var(--accent)' }}
            >
              Литературная история
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'var(--text)' }}
            >
              {polishedText || (
                <span style={{ color: 'var(--text-muted)' }}>История ещё не готова</span>
              )}
            </p>
          </div>
        )}
        {(view === 'raw' || view === 'split') && (
          <div
            className="rounded-2xl p-6"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p
              className="text-xs uppercase tracking-widest mb-4"
              style={{ color: 'var(--text-muted)' }}
            >
              Оригинальный разговор
            </p>
            <pre
              className="text-sm whitespace-pre-wrap leading-relaxed"
              style={{ color: 'var(--text-muted)', fontFamily: 'inherit' }}
            >
              {rawText || (
                <span style={{ color: 'var(--text-dim)' }}>Нет данных</span>
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
