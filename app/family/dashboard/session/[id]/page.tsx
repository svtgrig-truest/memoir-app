export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase/server';
import { TranscriptViewer } from '@/components/TranscriptViewer';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: session } = await supabaseAdmin
    .from('sessions')
    .select('*, transcripts(*), chapters(title_ru)')
    .eq('id', id)
    .single();

  if (!session) notFound();

  const sessionData = session as Record<string, unknown>;
  const transcripts = sessionData.transcripts as Record<string, unknown>[] | null;
  const transcript = transcripts?.[0] ?? null;
  const chapter = sessionData.chapters as Record<string, unknown> | null;

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/family/dashboard" className="text-white/40 text-sm hover:text-white">
            ← Назад
          </Link>
          <h1 className="text-xl font-bold mt-1">
            {(chapter?.title_ru as string) ?? 'Свободный разговор'}
          </h1>
          <p className="text-white/40 text-sm">
            {new Date(sessionData.started_at as string).toLocaleDateString('ru-RU', {
              day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
            })}
          </p>
        </div>

        {transcript && (
          <div className="flex gap-2">
            <a
              href={`/api/export?session_id=${id}&type=raw`}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            >
              ↓ Транскрипт .txt
            </a>
            <a
              href={`/api/export?session_id=${id}&type=polished`}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            >
              ↓ Мемуар .txt
            </a>
            <a
              href={`/api/export?session_id=${id}&type=pdf`}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors"
            >
              ↓ PDF
            </a>
          </div>
        )}
      </div>

      {transcript ? (
        <TranscriptViewer
          rawText={(transcript.raw_text as string) ?? ''}
          polishedText={(transcript.polished_text as string) ?? ''}
        />
      ) : (
        <p className="text-white/40">Транскрипт ещё обрабатывается...</p>
      )}
    </main>
  );
}
