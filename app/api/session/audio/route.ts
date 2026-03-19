import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const BUCKET = 'recordings';

async function ensureBucket() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
  }
}

// GET /api/session/audio?session_id=xxx  → { url: signedUrl | null }
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });

  for (const ext of ['webm', 'ogg', 'mp4']) {
    const { data } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(`${sessionId}.${ext}`, 3600);
    if (data?.signedUrl) return NextResponse.json({ url: data.signedUrl, ext });
  }
  return NextResponse.json({ url: null });
}

// POST /api/session/audio  (FormData: session_id + audio File)
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const sessionId = formData.get('session_id') as string | null;
  const audio = formData.get('audio') as File | null;

  if (!sessionId || !audio) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  await ensureBucket();

  const ext = audio.type.includes('ogg') ? 'ogg' : audio.type.includes('mp4') ? 'mp4' : 'webm';
  const buffer = await audio.arrayBuffer();

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(`${sessionId}.${ext}`, buffer, {
      contentType: audio.type || 'audio/webm',
      upsert: true,
    });

  if (error) {
    console.error('Audio upload to storage failed:', error.message);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
