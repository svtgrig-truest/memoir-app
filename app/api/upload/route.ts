import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const sessionId = formData.get('session_id') as string | null;

  if (!file || !sessionId) {
    return NextResponse.json({ error: 'Missing file or session_id' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() ?? 'bin';
  const path = `sessions/${sessionId}/${Date.now()}.${ext}`;

  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await supabaseAdmin.storage
    .from('media')
    .upload(path, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from('media').getPublicUrl(path);

  const { error: dbError } = await supabaseAdmin.from('session_media').insert({
    session_id: sessionId,
    file_url: publicUrl,
    mime_type: file.type,
  });

  if (dbError) {
    console.error('Failed to record media in DB:', dbError.message);
    // Non-fatal: file is uploaded, just log the DB error
  }

  return NextResponse.json({ url: publicUrl });
}
