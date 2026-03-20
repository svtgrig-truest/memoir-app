import { NextRequest, NextResponse } from 'next/server';
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

export async function POST(req: NextRequest) {
  const { title_ru } = await req.json().catch(() => ({}));
  const name = (title_ru ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Название не может быть пустым' }, { status: 400 });
  }

  const { data: maxRow } = await supabaseAdmin
    .from('chapters')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = ((maxRow as { display_order: number } | null)?.display_order ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from('chapters')
    .insert({ title_ru: name, display_order: nextOrder, theme: 'custom' })
    .select('id, title_ru, display_order, theme')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
