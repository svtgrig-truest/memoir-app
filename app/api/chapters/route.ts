import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
  const [chaptersResult, lastSessionResult] = await Promise.all([
    supabaseAdmin
      .from('chapters')
      .select('id, title_ru, display_order, theme')
      .neq('theme', 'free')
      .order('display_order'),
    supabaseAdmin
      .from('sessions')
      .select('chapter_id')
      .eq('status', 'complete')
      .not('chapter_id', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (chaptersResult.error) {
    return NextResponse.json({ error: chaptersResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    chapters: chaptersResult.data ?? [],
    lastChapterId: (lastSessionResult.data as { chapter_id: string } | null)?.chapter_id ?? null,
  });
}
