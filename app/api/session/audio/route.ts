import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const BUCKET = 'recordings';

async function ensureBucket() {
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      const { error } = await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
      if (error && !error.message.includes('already exists')) {
        console.error('Bucket creation failed:', error.message);
      }
    }
  } catch (e) {
    console.error('ensureBucket error:', e);
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

  const ct = audio.type || 'audio/webm';
  const ext = ct.includes('ogg') ? 'ogg' : ct.includes('mp4') ? 'mp4' : 'webm';
  const buffer = await audio.arrayBuffer();

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(`${sessionId}.${ext}`, buffer, {
      contentType: ct,
      upsert: true,
    });

  if (error) {
    console.error('Audio upload to storage failed:', error.message);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
