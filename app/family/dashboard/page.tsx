export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase/server';
import Link from 'next/link';

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

export default async function Dashboard() {
  const { data: chapters } = await supabaseAdmin
    .from('chapters')
    .select('id, title_ru, display_order, sessions(id, started_at, status)')
    .order('display_order') as { data: ChapterWithSessions[] | null };

  // Collect sessions with no chapter (free-form / untagged)
  const { data: untaggedSessions } = await supabaseAdmin
    .from('sessions')
    .select('id, started_at, status')
    .is('chapter_id', null)
    .eq('status', 'complete')
    .order('started_at', { ascending: false });

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-4 py-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Воспоминания</h1>
        <Link
          href="/family/dashboard/heritage"
          className="text-sm text-white/50 hover:text-white transition-colors"
        >
          Документы →
        </Link>
      </div>

      <div className="space-y-4">
        {chapters?.map((chapter) => (
          <div key={chapter.id} className="bg-zinc-900 rounded-2xl p-5">
            <h2 className="text-base font-semibold mb-3">{chapter.title_ru}</h2>
            {chapter.sessions?.length === 0 ? (
              <p className="text-white/30 text-sm">Нет записей</p>
            ) : (
              <div className="space-y-2">
                {chapter.sessions.map((session) => (
                  <Link
                    key={session.id}
                    href={`/family/dashboard/session/${session.id}`}
                    className="flex items-center justify-between bg-white/5 hover:bg-white/10 rounded-xl px-4 py-3 transition-colors"
                  >
                    <span className="text-sm text-white/70">
                      {new Date(session.started_at).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        session.status === 'complete'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}
                    >
                      {session.status === 'complete' ? 'Завершено' : 'Пауза'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Untagged sessions */}
        {untaggedSessions && untaggedSessions.length > 0 && (
          <div className="bg-zinc-900 rounded-2xl p-5">
            <h2 className="text-base font-semibold mb-3">Без темы</h2>
            <div className="space-y-2">
              {untaggedSessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/family/dashboard/session/${session.id}`}
                  className="flex items-center justify-between bg-white/5 hover:bg-white/10 rounded-xl px-4 py-3 transition-colors"
                >
                  <span className="text-sm text-white/70">
                    {new Date(session.started_at).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                    Завершено
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
