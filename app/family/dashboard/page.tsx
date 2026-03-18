export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase/server';
import Link from 'next/link';
import { BookOpen, FileText } from 'lucide-react';

interface SessionRow {
  id: string;
  started_at: string;
  status: string;
}

interface ChapterWithSessions {
  id: string;
  title_ru: string;
  display_order: number;
  sessions: SessionRow[];
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function Dashboard() {
  const { data: chapters } = await supabaseAdmin
    .from('chapters')
    .select('id, title_ru, display_order, sessions(id, started_at, status)')
    .order('display_order') as { data: ChapterWithSessions[] | null };

  const { data: untaggedSessions } = await supabaseAdmin
    .from('sessions')
    .select('id, started_at, status')
    .is('chapter_id', null)
    .eq('status', 'complete')
    .order('started_at', { ascending: false });

  const totalSessions =
    (chapters?.reduce((sum, ch) => sum + (ch.sessions?.length ?? 0), 0) ?? 0) +
    (untaggedSessions?.length ?? 0);

  return (
    <main
      className="min-h-screen px-4 py-8 max-w-2xl mx-auto"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link
            href="/"
            className="text-xs uppercase tracking-widest transition-colors mb-3 block"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={undefined}
          >
            ← Memoir
          </Link>
          <h1 className="text-2xl font-semibold">Семейный архив</h1>
          {totalSessions > 0 && (
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {totalSessions} {totalSessions === 1 ? 'запись' : totalSessions < 5 ? 'записи' : 'записей'}
            </p>
          )}
        </div>
        <Link
          href="/family/dashboard/heritage"
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl transition-all"
          style={{
            color: 'var(--text-muted)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
          }}
        >
          <FileText className="w-4 h-4" />
          Документы
        </Link>
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
                <h2 className="text-sm font-medium">{chapter.title_ru}</h2>
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
                    href={`/family/dashboard/session/${session.id}`}
                    className="flex items-center justify-between px-5 py-3.5 transition-colors group"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={undefined}
                  >
                    <span className="text-sm group-hover:text-[var(--text)] transition-colors">
                      {formatDate(session.started_at)}
                    </span>
                    <span className="text-xs">→</span>
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
              <h2 className="text-sm font-medium">Свободные разговоры</h2>
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
                  href={`/family/dashboard/session/${session.id}`}
                  className="flex items-center justify-between px-5 py-3.5 transition-colors group"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span className="text-sm group-hover:text-[var(--text)] transition-colors">
                    {formatDate(session.started_at)}
                  </span>
                  <span className="text-xs">→</span>
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
