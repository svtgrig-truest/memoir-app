export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase/server';
import { HeritageUpload } from '@/components/HeritageUpload';
import { HeritageDocCard } from '@/components/HeritageDocCard';
import Link from 'next/link';

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
          Загруженные документы помогают AI задавать более точные и личные вопросы.
          Поддерживаются PDF, DOCX и TXT.
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
            <HeritageDocCard key={doc.id} doc={doc} />
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
