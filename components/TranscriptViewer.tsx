'use client';
import { useState } from 'react';
import { BookOpen, MessageSquare, Columns2, Pencil, Check, X, Loader2 } from 'lucide-react';

interface Props {
  rawText: string;
  polishedText: string;
  transcriptId: string;
}

type View = 'raw' | 'polished' | 'split';

const tabs: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'raw', label: 'Разговор', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'polished', label: 'История', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'split', label: 'Оба', icon: <Columns2 className="w-4 h-4" /> },
];

export function TranscriptViewer({ rawText, polishedText: initialPolished, transcriptId }: Props) {
  const [view, setView] = useState<View>('raw');
  const [polishedText, setPolishedText] = useState(initialPolished);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(initialPolished);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/transcript', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transcriptId, polished_text: editValue }),
      });
      if (!res.ok) throw new Error('Ошибка сервера');
      setPolishedText(editValue);
      setEditing(false);
    } catch {
      setSaveError('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(polishedText);
    setEditing(false);
    setSaveError(null);
  };

  const showRaw = view === 'raw' || view === 'split';
  const showPolished = view === 'polished' || view === 'split';

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
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
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
      <div
        className={`grid gap-4 ${view === 'split' ? 'md:grid-cols-2 grid-cols-1' : 'grid-cols-1'}`}
      >
        {/* Raw transcript panel */}
        {showRaw && (
          <div
            className="rounded-2xl p-8"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-xs uppercase tracking-widest mb-6" style={{ color: 'var(--text-muted)' }}>
              Оригинальный разговор
            </p>
            <pre
              style={{
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: '1.0625rem',
                lineHeight: '1.85',
                whiteSpace: 'pre-wrap',
                opacity: 0.82,
              }}
            >
              {rawText || <span style={{ color: 'var(--text-muted)' }}>Нет данных</span>}
            </pre>
          </div>
        )}

        {/* Polished text panel */}
        {showPolished && (
          <div
            className="rounded-2xl p-8"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-6 gap-3">
              <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
                Литературная история
              </p>
              {!editing ? (
                <button
                  onClick={() => { setEditValue(polishedText); setEditing(true); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all"
                  style={{
                    color: 'var(--text-muted)',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Редактировать
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all disabled:opacity-50"
                    style={{
                      background: 'var(--accent-dim)',
                      color: 'var(--accent)',
                      border: '1px solid var(--accent-border)',
                    }}
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {saving ? 'Сохранение...' : 'Сохранить'}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all disabled:opacity-50"
                    style={{
                      color: 'var(--text-muted)',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                    Отмена
                  </button>
                </div>
              )}
            </div>

            {editing ? (
              <>
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full resize-y rounded-xl p-5 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                    fontSize: '1.0625rem',
                    lineHeight: '1.85',
                    minHeight: '400px',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                {saveError && (
                  <p className="text-sm mt-2" style={{ color: '#e05040' }}>
                    {saveError}
                  </p>
                )}
              </>
            ) : (
              <p
                style={{
                  color: 'var(--text)',
                  fontSize: '1.125rem',
                  lineHeight: '1.9',
                  whiteSpace: 'pre-wrap',
                  maxWidth: '68ch',
                }}
              >
                {polishedText || (
                  <span style={{ color: 'var(--text-muted)' }}>История ещё не готова</span>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
