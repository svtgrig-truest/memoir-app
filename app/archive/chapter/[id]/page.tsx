export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpen, Mic } from 'lucide-react';

interface TranscriptMeta {
  id: string;
  short_title: string | null;
}

interface SessionRow {
  id: string;
  started_at: string;
  status: string;
  transcripts: TranscriptMeta[] | TranscriptMeta | null;
}

interface ChapterDetail {
  id: string;
  title_ru: string;
  sessions: SessionRow[];
}

function getShortTitle(session: SessionRow): string | null {
  const t = session.transcripts;
  if (!t) return null;
  const item = Array.isArray(t) ? t[0] : t;
  return item?.short_title ?? null;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function ChapterArchivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: chapter } = await supabaseAdmin
    .from('chapters')
    .select('id, title_ru, sessions(id, started_at, status, transcripts(id, short_title))')
    .eq('id', id)
    .single() as { data: ChapterDetail | null };

  if (!chapter) notFound();

  const sessions = (chapter.sessions ?? [])
    .filter(s => s.status === 'complete')
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  return (
    <main
      className="min-h-screen px-4 py-8 max-w-2xl mx-auto"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/"
          className="text-xs uppercase tracking-widest transition-colors mb-3 block"
          style={{ color: 'var(--text-muted)' }}
        >
          ← Memoir
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
              <h1 className="text-2xl font-semibold">{chapter.title_ru}</h1>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {sessions.length > 0
                ? `${sessions.length} ${sessions.length === 1 ? 'запись' : sessions.length < 5 ? 'записи' : 'записей'}`
                : 'Записей пока нет'}
            </p>
          </div>

          {/* Start new recording button */}
          <a
            href={`/?chapter=${chapter.id}`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex-shrink-0"
            style={{
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              border: '1px solid var(--accent-border)',
            }}
          >
            <Mic className="w-4 h-4" />
            Начать разговор
          </a>
        </div>
      </div>

      {/* Sessions list */}
      {sessions.length > 0 ? (
        <div className="space-y-2">
          {sessions.map((session, index) => (
            <Link
              key={session.id}
              href={`/archive/session/${session.id}`}
              className="flex items-center justify-between px-6 py-5 rounded-2xl transition-colors group"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="flex-1 min-w-0">
                {index === 0 && (
                  <div className="mb-2">
                    <span
                      className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full"
                      style={{
                        background: 'var(--accent-dim)',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent-border)',
                      }}
                    >
                      Последний разговор
                    </span>
                  </div>
                )}
                {getShortTitle(session) && (
                  <p
                    className="text-base font-medium mb-1 group-hover:text-[var(--accent)] transition-colors truncate"
                    style={{ color: 'var(--text)' }}
                  >
                    {getShortTitle(session)}
                  </p>
                )}
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {formatDateTime(session.started_at)}
                </p>
              </div>
              <span className="text-xs flex-shrink-0 ml-4" style={{ color: 'var(--text-muted)' }}>
                →
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div
          className="rounded-2xl px-6 py-12 text-center"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
            Разговоров об этом ещё не было
          </p>
          <a
            href={`/?chapter=${chapter.id}`}
            className="inline-flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl transition-all"
            style={{
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              border: '1px solid var(--accent-border)',
            }}
          >
            <Mic className="w-4 h-4" />
            Начать первый разговор
          </a>
        </div>
      )}
    </main>
  );
}
