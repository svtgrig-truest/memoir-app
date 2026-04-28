import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const BUCKET = 'recordings';

function ext(mimeType: string) {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'mp4';
  return 'webm';
}

// GET /api/session/audio?session_id=xxx&intent=upload&mime=audio/webm
//   intent=upload → returns signed upload URL for direct browser→Supabase upload
//   intent=read   → returns signed download URL (default)
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sessionId = searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });

  const intent = searchParams.get('intent') ?? 'read';

  if (intent === 'upload') {
    const mime = searchParams.get('mime') ?? 'audio/webm';
    const path = `${sessionId}.${ext(mime)}`;
    console.log('[audio/sign] upload requested for', path, 'mime:', mime);
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error) {
      console.error('[audio/sign] createSignedUploadUrl failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.log('[audio/sign] signed upload URL issued for', path);
    return NextResponse.json({ signedUrl: data.signedUrl, path, token: data.token });
  }

  // intent=read — try all extensions
  for (const e of ['webm', 'ogg', 'mp4']) {
    const { data } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(`${sessionId}.${e}`, 3600);
    if (data?.signedUrl) return NextResponse.json({ url: data.signedUrl, ext: e });
  }
  return NextResponse.json({ url: null });
}

// POST kept for backward compat / very small files
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const sessionId = formData.get('session_id') as string | null;
  const audio = formData.get('audio') as File | null;
  if (!sessionId || !audio) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const ct = audio.type || 'audio/webm';
  const buffer = await audio.arrayBuffer();

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(`${sessionId}.${ext(ct)}`, buffer, { contentType: ct, upsert: true });

  if (error) {
    console.error('[audio/upload] storage upload failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
