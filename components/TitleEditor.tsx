'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X } from 'lucide-react';

export function TitleEditor({
  initialTitle,
  transcriptId,
  placeholder = 'Без названия',
}: {
  initialTitle: string | null;
  transcriptId: string;
  placeholder?: string;
}) {
  const [title, setTitle] = useState(initialTitle ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(title);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [editing, title]);

  const startEdit = () => setEditing(true);

  const cancel = () => setEditing(false);

  const save = async () => {
    const trimmed = draft.trim();
    if (trimmed === title) { setEditing(false); return; }
    setSaving(true);
    try {
      await fetch('/api/transcript', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transcriptId, short_title: trimmed }),
      });
      setTitle(trimmed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={saving}
          className="flex-1 bg-transparent border-b text-2xl font-semibold outline-none px-0 py-0.5"
          style={{
            borderColor: 'var(--accent)',
            color: 'var(--text)',
            minWidth: 0,
          }}
        />
        <button
          onClick={save}
          disabled={saving}
          className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--accent)' }}
          title="Сохранить"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          onClick={cancel}
          disabled={saving}
          className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          title="Отмена"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="group flex items-center gap-2 text-left"
      title="Нажмите, чтобы изменить название"
    >
      <span
        className="text-2xl font-semibold group-hover:opacity-80 transition-opacity"
        style={{ color: title ? 'var(--text)' : 'var(--text-muted)' }}
      >
        {title || placeholder}
      </span>
      <Pencil
        className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      />
    </button>
  );
}
