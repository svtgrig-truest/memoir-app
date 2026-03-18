'use client';
import React from 'react';
import { ExternalLink } from 'lucide-react';

interface Doc {
  id: string;
  filename: string;
  file_url: string;
  summary_text: string | null;
}

export function HeritageDocCard({ doc }: { doc: Doc }) {
  return (
    <div
      className="rounded-xl px-4 py-3.5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
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
    </div>
  );
}
