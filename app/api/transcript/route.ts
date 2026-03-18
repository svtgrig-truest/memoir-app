import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, polished_text, short_title } = body as {
    id: string;
    polished_text?: string;
    short_title?: string;
  };

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (polished_text !== undefined) updates.polished_text = polished_text;
  if (short_title !== undefined) updates.short_title = short_title;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('transcripts')
    .update(updates)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
