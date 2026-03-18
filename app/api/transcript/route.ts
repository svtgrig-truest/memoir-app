import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, polished_text } = body as { id: string; polished_text: string };

  if (!id || polished_text === undefined) {
    return NextResponse.json({ error: 'Missing id or polished_text' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('transcripts')
    .update({ polished_text })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
