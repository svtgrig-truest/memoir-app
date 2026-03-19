export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  buildRawTranscript,
  buildPolishPrompt,
  buildTagPrompt,
  buildSummaryPrompt,
  buildTitlePrompt,
  countUserWords,
} from '@/lib/pipeline';
import { TurnMessage } from '@/lib/realtime';

export async function POST(req: NextRequest) {
  const { session_id, messages }: { session_id: string; messages: TurnMessage[] } =
    await req.json();

  if (!session_id) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  // No messages or user said too little — mark complete, skip transcript creation
  const MIN_USER_WORDS = 8;
  if (!messages?.length || countUserWords(messages) < MIN_USER_WORDS) {
    await supabaseAdmin
      .from('sessions')
      .update({ status: 'complete', ended_at: new Date().toISOString() })
      .eq('id', session_id);
    return NextResponse.json({ ok: true, skipped: true });
  }

  const rawText = buildRawTranscript(messages);

  // Save raw transcript immediately so data isn't lost if GPT-4o calls fail
  const { data: transcript, error: transcriptError } = await supabaseAdmin
    .from('transcripts')
    .insert({ session_id, raw_text: rawText })
    .select()
    .single();

  if (transcriptError || !transcript) {
    return NextResponse.json(
      { error: transcriptError?.message ?? 'Failed to save transcript' },
      { status: 500 }
    );
  }

  // Fetch chapter titles for tagging + existing short_titles to avoid repetition
  const [{ data: chapters }, { data: existingTx }] = await Promise.all([
    supabaseAdmin.from('chapters').select('id, title_ru'),
    supabaseAdmin
      .from('transcripts')
      .select('short_title')
      .not('short_title', 'is', null)
      .neq('id', transcript.id),
  ]);
  const chapterTitles = chapters?.map((c) => c.title_ru) ?? [];
  const existingTitles = (existingTx ?? [])
    .map((t: { short_title: string | null }) => t.short_title)
    .filter(Boolean) as string[];

  // Run GPT-4o polish + tag + summarize + title in parallel
  // Wrapped in try/catch — raw_text is already saved, so data is never lost
  let polishedText = '';
  let sessionSummary = '';
  let shortTitle: string | null = null;
  let matchedChapterId: string | undefined;

  try {
    const [polishRes, tagRes, summaryRes, titleRes] = await Promise.all([
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildPolishPrompt(rawText) }],
      }),
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildTagPrompt(rawText, chapterTitles) }],
      }),
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildSummaryPrompt(rawText) }],
      }),
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildTitlePrompt(rawText, existingTitles) }],
      }),
    ]);

    polishedText = polishRes.choices[0].message.content ?? '';
    const taggedTitle = tagRes.choices[0].message.content?.trim() ?? '';
    sessionSummary = summaryRes.choices[0].message.content ?? '';
    shortTitle = titleRes.choices[0].message.content?.trim() || null;

    const matchedChapter = chapters?.find(
      (c) => c.title_ru.toLowerCase() === taggedTitle.toLowerCase()
    );
    matchedChapterId = matchedChapter?.id;

    await supabaseAdmin
      .from('transcripts')
      .update({
        polished_text: polishedText,
        session_summary: sessionSummary,
        short_title: shortTitle,
        polished_at: new Date().toISOString(),
      })
      .eq('id', transcript.id);
  } catch (pipelineErr) {
    console.error('Pipeline failed — raw transcript saved, polished_text=null:', pipelineErr);
    // Transcript remains with raw_text only; can be retried via /api/transcript/reprocess
  }

  // Always mark session complete regardless of pipeline outcome
  await supabaseAdmin
    .from('sessions')
    .update({
      status: 'complete',
      ended_at: new Date().toISOString(),
      ...(matchedChapterId ? { chapter_id: matchedChapterId } : {}),
    })
    .eq('id', session_id);

  return NextResponse.json({ ok: true, polished: !!polishedText });
}
