export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase/server';
import { HeritageUpload } from '@/components/HeritageUpload';
import Link from 'next/link';
import { CheckCircle2, Clock } from 'lucide-react';

export default async function HeritagePage() {
  const { data: docs } = await supabaseAdmin
    .from('heritage_docs')
    .select('*')
    .order('uploaded_at', { ascending: false });

  return (
    <main
      className="min-h-screen p-6 max-w-2xl mx-auto"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/family/dashboard"
          className="text-sm transition-colors mb-4 block"
          style={{ color: 'var(--text-muted)' }}
        >
          ← Назад к архиву
        </Link>
        <h1 className="text-2xl font-semibold">Семейные документы</h1>
        <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
          Загруженные документы помогают AI задавать более точные и личные вопросы
        </p>
      </div>

      {/* Upload */}
      <div
        className="rounded-2xl p-5 mb-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <HeritageUpload />
      </div>

      {/* Document list */}
      {docs && docs.length > 0 && (
        <div className="space-y-2">
          <p
            className="text-xs uppercase tracking-widest mb-3"
            style={{ color: 'var(--text-muted)' }}
          >
            Загруженные документы
          </p>
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="rounded-xl px-4 py-3.5 flex items-start justify-between gap-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: 'var(--text)' }}>
                  {doc.filename}
                </p>
                {doc.summary_text && (
                  <p
                    className="text-xs mt-1 line-clamp-2 leading-relaxed"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {doc.summary_text}
                  </p>
                )}
              </div>
              <div className="flex-shrink-0 flex items-center gap-1.5">
                {doc.summary_text ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                    <span className="text-xs" style={{ color: 'var(--accent)' }}>
                      Готов
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Обработка
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {docs?.length === 0 && (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
          Документы ещё не загружены
        </p>
      )}
    </main>
  );
}
