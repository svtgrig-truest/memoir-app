export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase/server';
import { HeritageUpload } from '@/components/HeritageUpload';
import Link from 'next/link';

export default async function HeritagePage() {
  const { data: docs } = await supabaseAdmin
    .from('heritage_docs')
    .select('*')
    .order('uploaded_at', { ascending: false });

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href="/family/dashboard" className="text-white/40 text-sm hover:text-white">
          ← Воспоминания
        </Link>
        <h1 className="text-2xl font-bold mt-2">Семейные документы</h1>
        <p className="text-white/40 text-sm mt-1">
          Загрузите документы — AI использует их как контекст при интервью
        </p>
      </div>

      <div className="space-y-2 mb-6">
        {docs?.length === 0 && (
          <p className="text-white/30 text-sm">Документы ещё не загружены</p>
        )}
        {docs?.map((doc) => (
          <div key={doc.id} className="bg-zinc-900 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80">{doc.filename}</p>
              {doc.summary_text && (
                <p className="text-xs text-white/40 mt-1 line-clamp-2">{doc.summary_text}</p>
              )}
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ml-4 shrink-0 ${
              doc.summary_text ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
            }`}>
              {doc.summary_text ? 'Обработан' : 'Ожидание'}
            </span>
          </div>
        ))}
      </div>

      <HeritageUpload />
    </main>
  );
}
