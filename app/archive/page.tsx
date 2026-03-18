export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase/server';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

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

interface ChapterWithSessions {
  id: string;
  title_ru: string;
  display_order: number;
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

export default async function ArchivePage() {
  const { data: chapters } = await supabaseAdmin
    .from('chapters')
    .select('id, title_ru, display_order, sessions(id, started_at, status, transcripts(id, short_title))')
    .order('display_order') as { data: ChapterWithSessions[] | null };

  const { data: untaggedSessions } = await supabaseAdmin
    .from('sessions')
    .select('id, started_at, status, transcripts(id, short_title)')
    .is('chapter_id', null)
    .eq('status', 'complete')
    .order('started_at', { ascending: false }) as { data: SessionRow[] | null };

  const totalSessions =
    (chapters?.reduce((sum, ch) => sum + (ch.sessions?.filter(s => s.status === 'complete').length ?? 0), 0) ?? 0) +
    (untaggedSessions?.length ?? 0);

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
        <h1 className="text-2xl font-semibold">Мои записи</h1>
        {totalSessions > 0 && (
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {totalSessions} {totalSessions === 1 ? 'запись' : totalSessions < 5 ? 'записи' : 'записей'}
          </p>
        )}
      </div>

      {/* Chapter sections */}
      <div className="space-y-3">
        {chapters?.map((chapter) => {
          const completedSessions = chapter.sessions?.filter(s => s.status === 'complete') ?? [];
          if (completedSessions.length === 0) return null;

          return (
            <section
              key={chapter.id}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div
                className="flex items-center gap-3 px-5 py-4"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                <h2 className="text-base font-medium">{chapter.title_ru}</h2>
                <span
                  className="ml-auto text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: 'var(--accent-dim)',
                    color: 'var(--accent)',
                    border: '1px solid var(--accent-border)',
                  }}
                >
                  {completedSessions.length}
                </span>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {completedSessions.map((session) => (
                  <Link
                    key={session.id}
                    href={`/archive/session/${session.id}`}
                    className="flex items-center justify-between px-5 py-4 transition-colors group"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <div>
                      {getShortTitle(session) && (
                        <p
                          className="text-base font-medium mb-1 group-hover:text-[var(--text)] transition-colors"
                          style={{ color: 'var(--text)' }}
                        >
                          {getShortTitle(session)}
                        </p>
                      )}
                      <p className="text-sm">{formatDateTime(session.started_at)}</p>
                    </div>
                    <span className="text-sm flex-shrink-0 ml-4">→</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {/* Untagged sessions */}
        {untaggedSessions && untaggedSessions.length > 0 && (
          <section
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div
              className="flex items-center gap-3 px-5 py-4"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <h2 className="text-base font-medium">Свободные разговоры</h2>
              <span
                className="ml-auto text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}
              >
                {untaggedSessions.length}
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {untaggedSessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/archive/session/${session.id}`}
                  className="flex items-center justify-between px-5 py-4 transition-colors group"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <div>
                    {getShortTitle(session) && (
                      <p
                        className="text-base font-medium mb-1 group-hover:text-[var(--text)] transition-colors"
                        style={{ color: 'var(--text)' }}
                      >
                        {getShortTitle(session)}
                      </p>
                    )}
                    <p className="text-sm">{formatDateTime(session.started_at)}</p>
                  </div>
                  <span className="text-sm flex-shrink-0 ml-4">→</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {totalSessions === 0 && (
          <div
            className="rounded-2xl px-6 py-12 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Воспоминания ещё не записаны
            </p>
            <Link
              href="/"
              className="text-sm px-4 py-2 rounded-xl transition-all"
              style={{
                background: 'var(--accent-dim)',
                color: 'var(--accent)',
                border: '1px solid var(--accent-border)',
              }}
            >
              Начать первый разговор
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
