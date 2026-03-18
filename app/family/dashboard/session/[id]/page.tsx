export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase/server';
import { TranscriptViewer } from '@/components/TranscriptViewer';
import { SessionPhotos } from '@/components/SessionPhotos';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Download, FileText, BookOpen } from 'lucide-react';

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [{ data: session }, { data: photos }] = await Promise.all([
    supabaseAdmin
      .from('sessions')
      .select('*, transcripts(*), chapters(title_ru)')
      .eq('id', id)
      .single(),
    supabaseAdmin
      .from('session_media')
      .select('id, file_url, mime_type, created_at')
      .eq('session_id', id)
      .order('created_at'),
  ]);

  if (!session) notFound();

  const sessionData = session as Record<string, unknown>;
  const txRaw = sessionData.transcripts;
  const transcript: Record<string, unknown> | null =
    Array.isArray(txRaw) ? (txRaw[0] ?? null) : (txRaw as Record<string, unknown> | null) ?? null;
  const chapter = sessionData.chapters as Record<string, unknown> | null;

  const dateStr = new Date(sessionData.started_at as string).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <main
      className="min-h-screen p-6 max-w-5xl mx-auto"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* Navigation */}
      <Link
        href="/family/dashboard"
        className="inline-flex items-center gap-1.5 text-sm mb-6 transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        ← Назад к архиву
      </Link>

      {/* Session header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
            <h1 className="text-xl font-semibold">
              {(chapter?.title_ru as string) ?? 'Свободный разговор'}
            </h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {dateStr}
          </p>
        </div>

        {transcript && (
          <div className="flex flex-col gap-2 flex-shrink-0">
            <ExportButton
              href={`/api/export?session_id=${id}&type=pdf`}
              label="Скачать PDF"
              icon={<Download className="w-4 h-4" />}
              primary
            />
            <div className="flex gap-2">
              <ExportButton
                href={`/api/export?session_id=${id}&type=polished`}
                label="История .txt"
                icon={<BookOpen className="w-3.5 h-3.5" />}
              />
              <ExportButton
                href={`/api/export?session_id=${id}&type=raw`}
                label="Разговор .txt"
                icon={<FileText className="w-3.5 h-3.5" />}
              />
            </div>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="space-y-6">
        {/* Transcript */}
        {transcript ? (
          <TranscriptViewer
            rawText={(transcript.raw_text as string) ?? ''}
            polishedText={(transcript.polished_text as string) ?? ''}
          />
        ) : (
          <div
            className="rounded-2xl px-6 py-10 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              История обрабатывается, загляните чуть позже...
            </p>
          </div>
        )}

        {/* Photos — always visible, can add at any time */}
        <SessionPhotos
          sessionId={id}
          initialPhotos={photos ?? []}
        />
      </div>
    </main>
  );
}

function ExportButton({
  href,
  label,
  icon,
  primary,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all"
      style={
        primary
          ? {
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              border: '1px solid var(--accent-border)',
            }
          : {
              background: 'var(--bg-card)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }
      }
    >
      {icon}
      {label}
    </a>
  );
}
