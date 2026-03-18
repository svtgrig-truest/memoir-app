export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  buildRawTranscript,
  buildPolishPrompt,
  buildTagPrompt,
  buildSummaryPrompt,
  buildTitlePrompt,
} from '@/lib/pipeline';
import { TurnMessage } from '@/lib/realtime';

export async function POST(req: NextRequest) {
  const { session_id, messages }: { session_id: string; messages: TurnMessage[] } =
    await req.json();

  if (!session_id || !messages?.length) {
    return NextResponse.json({ error: 'Missing session_id or messages' }, { status: 400 });
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

  // Fetch chapter titles for tagging
  const { data: chapters } = await supabaseAdmin
    .from('chapters')
    .select('id, title_ru');
  const chapterTitles = chapters?.map((c) => c.title_ru) ?? [];

  // Run GPT-4o polish + tag + summarize + title in parallel
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
      messages: [{ role: 'user', content: buildTitlePrompt(rawText) }],
    }),
  ]);

  const polishedText = polishRes.choices[0].message.content ?? '';
  const taggedTitle = tagRes.choices[0].message.content?.trim() ?? '';
  const sessionSummary = summaryRes.choices[0].message.content ?? '';
  const shortTitle = titleRes.choices[0].message.content?.trim() ?? '';

  // Match tagged title back to a chapter ID
  const matchedChapter = chapters?.find(
    (c) => c.title_ru.toLowerCase() === taggedTitle.toLowerCase()
  );

  // Update transcript with polished text, summary and short title
  await supabaseAdmin
    .from('transcripts')
    .update({
      polished_text: polishedText,
      session_summary: sessionSummary,
      short_title: shortTitle || null,
      polished_at: new Date().toISOString(),
    })
    .eq('id', transcript.id);

  // Mark session complete and assign chapter if matched
  await supabaseAdmin
    .from('sessions')
    .update({
      status: 'complete',
      ended_at: new Date().toISOString(),
      ...(matchedChapter ? { chapter_id: matchedChapter.id } : {}),
    })
    .eq('id', session_id);

  return NextResponse.json({ ok: true });
}
