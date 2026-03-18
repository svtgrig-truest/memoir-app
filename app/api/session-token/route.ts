import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase/server';
import { buildSystemPrompt } from '@/lib/realtime';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const chapterId: string | null = body.chapter_id ?? null;

  // Fetch context data + create session record in parallel
  const [sessionResult, docsResult, transcriptsResult, chapterResult, lastChapterResult] = await Promise.all([
    supabaseAdmin
      .from('sessions')
      .insert({ chapter_id: chapterId, status: 'active' })
      .select()
      .single(),
    supabaseAdmin.from('heritage_docs').select('summary_text'),
    supabaseAdmin
      .from('transcripts')
      .select('session_summary')
      .not('session_summary', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3),
    chapterId
      ? supabaseAdmin.from('chapters').select('title_ru').eq('id', chapterId).single()
      : Promise.resolve({ data: null, error: null }),
    // Last completed session for this chapter (to build greeting context)
    chapterId
      ? supabaseAdmin
          .from('sessions')
          .select('transcripts(short_title, session_summary)')
          .eq('chapter_id', chapterId)
          .eq('status', 'complete')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const { data: session, error } = sessionResult;
  if (error || !session) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create session' },
      { status: 500 }
    );
  }

  // Extract last chapter session transcript
  const lastChapterData = lastChapterResult.data as {
    transcripts: { short_title: string | null; session_summary: string | null } | null
      | { short_title: string | null; session_summary: string | null }[]
  } | null;
  const lastChapterTx = lastChapterData?.transcripts
    ? Array.isArray(lastChapterData.transcripts)
      ? lastChapterData.transcripts[0]
      : lastChapterData.transcripts
    : null;
  const lastChapterShortTitle = lastChapterTx?.short_title ?? null;
  const lastChapterSummary = lastChapterTx?.session_summary ?? null;

  // Build system prompt server-side — anon key is never used for DB access
  const heritageSummary =
    docsResult.data?.map((d) => d.summary_text).filter(Boolean).join('\n') ?? null;
  const sessionSummaries =
    transcriptsResult.data?.map((t) => t.session_summary as string).filter(Boolean) ?? [];
  const chapterTitle = (chapterResult.data as { title_ru?: string } | null)?.title_ru ?? null;
  const systemPrompt = buildSystemPrompt({
    chapterTitle,
    heritageSummary,
    sessionSummaries,
    lastChapterShortTitle,
    lastChapterSummary,
  });

  // Get ephemeral token from OpenAI
  const realtimeSession = await openai.beta.realtime.sessions.create({
    model: 'gpt-4o-realtime-preview',
    voice: 'shimmer',
    input_audio_transcription: { model: 'whisper-1' },
  });

  return NextResponse.json({
    client_secret: realtimeSession.client_secret,
    session_id: session.id,
    system_prompt: systemPrompt,
  });
}
