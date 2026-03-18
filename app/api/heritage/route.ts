import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const safeFilename = file.name.replace(/[^\w.\-]/g, '_');
  const storagePath = `heritage/${Date.now()}-${safeFilename}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('Media')
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed', detail: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabaseAdmin.storage.from('Media').getPublicUrl(storagePath);

  const { error: insertError } = await supabaseAdmin.from('heritage_docs').insert({
    filename: file.name,
    file_url: publicUrl,
    mime_type: file.type,
    summary_text: null,
  });

  if (insertError) {
    return NextResponse.json({ error: 'Failed to save document record' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
