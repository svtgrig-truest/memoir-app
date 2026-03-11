import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const chapterId: string | null = body.chapter_id ?? null;

  // Create session record in DB first
  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .insert({ chapter_id: chapterId, status: 'active' })
    .select()
    .single();

  if (error || !session) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create session' },
      { status: 500 }
    );
  }

  // Get ephemeral token from OpenAI
  const realtimeSession = await openai.beta.realtime.sessions.create({
    model: 'gpt-4o-realtime-preview',
    voice: 'shimmer',
    input_audio_transcription: { model: 'whisper-1' },
  });

  return NextResponse.json({
    client_secret: realtimeSession.client_secret,
    session_id: session.id,
  });
}
