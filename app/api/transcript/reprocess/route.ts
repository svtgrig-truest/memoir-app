export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  buildPolishPrompt,
  buildTagPrompt,
  buildSummaryPrompt,
  buildTitlePrompt,
} from '@/lib/pipeline';

export async function POST(req: NextRequest) {
  const { transcript_id }: { transcript_id: string } = await req.json();
  if (!transcript_id) {
    return NextResponse.json({ error: 'Missing transcript_id' }, { status: 400 });
  }

  const { data: tx, error: txErr } = await supabaseAdmin
    .from('transcripts')
    .select('id, raw_text, session_id')
    .eq('id', transcript_id)
    .single();

  if (txErr || !tx?.raw_text) {
    return NextResponse.json({ error: 'Transcript not found or has no raw text' }, { status: 404 });
  }

  const [{ data: chapters }, { data: existingTx }] = await Promise.all([
    supabaseAdmin.from('chapters').select('id, title_ru'),
    supabaseAdmin
      .from('transcripts')
      .select('short_title')
      .not('short_title', 'is', null)
      .neq('id', transcript_id),
  ]);

  const chapterTitles = chapters?.map((c: { title_ru: string }) => c.title_ru) ?? [];
  const existingTitles = (existingTx ?? [])
    .map((t: { short_title: string | null }) => t.short_title)
    .filter(Boolean) as string[];

  const [polishRes, tagRes, summaryRes, titleRes] = await Promise.all([
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: buildPolishPrompt(tx.raw_text) }],
    }),
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: buildTagPrompt(tx.raw_text, chapterTitles) }],
    }),
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: buildSummaryPrompt(tx.raw_text) }],
    }),
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: buildTitlePrompt(tx.raw_text, existingTitles) }],
    }),
  ]);

  const polishedText = polishRes.choices[0].message.content ?? '';
  const taggedTitle = tagRes.choices[0].message.content?.trim() ?? '';
  const sessionSummary = summaryRes.choices[0].message.content ?? '';
  const shortTitle = titleRes.choices[0].message.content?.trim() || null;

  const matchedChapter = chapters?.find(
    (c: { id: string; title_ru: string }) => c.title_ru.toLowerCase() === taggedTitle.toLowerCase()
  );

  await supabaseAdmin
    .from('transcripts')
    .update({
      polished_text: polishedText,
      session_summary: sessionSummary,
      short_title: shortTitle,
      polished_at: new Date().toISOString(),
    })
    .eq('id', transcript_id);

  if (matchedChapter) {
    await supabaseAdmin
      .from('sessions')
      .update({ chapter_id: matchedChapter.id })
      .eq('id', tx.session_id);
  }

  return NextResponse.json({ ok: true });
}
