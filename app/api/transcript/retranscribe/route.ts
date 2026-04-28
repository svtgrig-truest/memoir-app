/**
 * POST /api/transcript/retranscribe
 *
 * Recover a session whose `raw_text` is missing user content (typically the
 * final reply, lost when the WebRTC channel was closed before Whisper's
 * `input_audio_transcription.completed` event landed).
 *
 * The mic-only audio recording is saved separately and directly to Supabase
 * Storage (`recordings/<session_id>.<ext>`), independently of the WebRTC
 * data channel. That recording therefore survives the client-side data loss
 * and can be re-transcribed.
 *
 * Pipeline:
 *   1. Locate transcript + session row, find audio file in Storage.
 *   2. Download audio, send to OpenAI Whisper (whisper-1, same model the
 *      Realtime session uses for live transcription) → flat text of the
 *      user's voice for the entire session.
 *   3. Reconstruct raw_text via GPT-4o, using the existing raw_text (which
 *      preserves the interviewer's questions verbatim — those came from the
 *      model and were not affected by the Whisper drop) plus the full
 *      audio transcription of the user's voice.
 *   4. Re-run the polish / tag / summarise / title pipeline.
 *
 * Body: { session_id: string, dry_run?: boolean }
 *
 * dry_run=true returns the proposed merged transcript without writing it,
 * for human review before committing the recovery.
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { toFile } from 'openai';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  buildPolishPrompt,
  buildTagPrompt,
  buildSummaryPrompt,
  buildTitlePrompt,
} from '@/lib/pipeline';

const BUCKET = 'recordings';
const AUDIO_EXTENSIONS = ['webm', 'ogg', 'mp4'] as const;

function buildMergePrompt(existingRaw: string, audioTranscript: string): string {
  return `Ты восстанавливаешь повреждённый транскрипт интервью.

КОНТЕКСТ:
В этом приложении интервью с пожилым человеком записывалось через WebRTC. Реплики интервьюера приходят от LLM напрямую и сохранились корректно. Реплики собеседника (Папы) приходят через отдельную транскрипцию аудио (Whisper) и могли быть частично потеряны, если соединение закрылось до прихода события транскрипции.

Параллельно велась МОНО-аудиозапись только микрофона собеседника (без голоса интервьюера) — она сохранилась полностью и заново прогнана через Whisper.

ЧТО НУЖНО СДЕЛАТЬ:
Собрать восстановленный транскрипт в исходном формате. Каждая реплика на отдельном абзаце, разделитель — пустая строка. Префиксы "Интервьюер:" и "Папа:".

ПРАВИЛА:
1. Сохрани ВСЕ реплики интервьюера из существующего транскрипта дословно — НИЧЕГО не меняй и не дополняй.
2. Реплики Папы перепиши, опираясь на полный аудио-транскрипт (он точнее и полнее, особенно в конце беседы). Используй именно текст из аудио-транскрипта, не из существующего транскрипта.
3. Логически распредели текст из аудио-транскрипта между ходами Папы — каждый ход следует за репликой интервьюера и отвечает на неё.
4. Если в аудио-транскрипте есть содержимое, явно выходящее за рамки последнего вопроса интервьюера (т.е. собеседник продолжил говорить или сменил тему сам), помести этот фрагмент целиком в последний ход Папы — не выдумывай дополнительные вопросы интервьюера.
5. НЕ выдумывай ничего. Если в аудио чего-то нет, не добавляй. Если в аудио есть что-то, чего нет в существующем транскрипте — обязательно включи это в реплики Папы.
6. Не комментируй, не описывай, не добавляй заголовков. Верни ТОЛЬКО восстановленный транскрипт в формате диалога.

СУЩЕСТВУЮЩИЙ ТРАНСКРИПТ (с возможными пропусками в репликах Папы):
${existingRaw}

ПОЛНЫЙ АУДИО-ТРАНСКРИПТ (только голос Папы за всю сессию):
${audioTranscript}

ВОССТАНОВЛЕННЫЙ ТРАНСКРИПТ:`;
}

async function findAudioFile(sessionId: string): Promise<{ ext: string; blob: Blob } | null> {
  for (const ext of AUDIO_EXTENSIONS) {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(`${sessionId}.${ext}`);
    if (data && !error) {
      return { ext, blob: data };
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionId: string | undefined = body.session_id;
  const dryRun: boolean = body.dry_run === true;

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  // ── 1. Fetch transcript + session ──────────────────────────────────────
  const { data: tx, error: txErr } = await supabaseAdmin
    .from('transcripts')
    .select('id, raw_text, session_id')
    .eq('session_id', sessionId)
    .single();

  if (txErr || !tx) {
    return NextResponse.json(
      { error: 'No transcript found for this session' },
      { status: 404 }
    );
  }

  // ── 2. Locate and download audio ───────────────────────────────────────
  const audio = await findAudioFile(sessionId);
  if (!audio) {
    return NextResponse.json(
      {
        error:
          'No audio recording found in Storage for this session. Recovery is only possible if the mic recording was successfully uploaded.',
      },
      { status: 404 }
    );
  }

  const audioBuffer = Buffer.from(await audio.blob.arrayBuffer());
  const audioFile = await toFile(audioBuffer, `${sessionId}.${audio.ext}`, {
    type: audio.blob.type || `audio/${audio.ext}`,
  });

  // ── 3. Whisper full transcription ──────────────────────────────────────
  let audioTranscript: string;
  try {
    const result = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
      language: 'ru',
      response_format: 'text',
    });
    // SDK returns string when response_format=text
    audioTranscript = (typeof result === 'string' ? result : (result as { text?: string }).text ?? '').trim();
  } catch (err) {
    console.error('[retranscribe] Whisper failed:', err);
    return NextResponse.json(
      { error: 'Whisper transcription failed', detail: (err as Error).message },
      { status: 502 }
    );
  }

  if (!audioTranscript) {
    return NextResponse.json(
      { error: 'Whisper returned empty transcript — audio may be silent or corrupted' },
      { status: 422 }
    );
  }

  // ── 4. Merge with existing raw_text via GPT-4o ─────────────────────────
  const existingRaw = tx.raw_text ?? '';
  let mergedRaw: string;
  try {
    const mergeRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: buildMergePrompt(existingRaw, audioTranscript) }],
    });
    mergedRaw = mergeRes.choices[0].message.content?.trim() ?? '';
  } catch (err) {
    console.error('[retranscribe] Merge failed:', err);
    return NextResponse.json(
      { error: 'Transcript merge failed', detail: (err as Error).message },
      { status: 502 }
    );
  }

  if (!mergedRaw) {
    return NextResponse.json({ error: 'Merge returned empty result' }, { status: 502 });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      audio_ext: audio.ext,
      existing_raw_chars: existingRaw.length,
      audio_transcript_chars: audioTranscript.length,
      merged_raw_chars: mergedRaw.length,
      audio_transcript: audioTranscript,
      merged_raw: mergedRaw,
    });
  }

  // ── 5. Persist new raw_text ────────────────────────────────────────────
  const { error: updRawErr } = await supabaseAdmin
    .from('transcripts')
    .update({ raw_text: mergedRaw })
    .eq('id', tx.id);

  if (updRawErr) {
    return NextResponse.json(
      { error: 'Failed to update raw_text', detail: updRawErr.message },
      { status: 500 }
    );
  }

  // ── 6. Re-run polish / tag / summarise / title on the new raw_text ─────
  const [{ data: chapters }, { data: existingTx }] = await Promise.all([
    supabaseAdmin.from('chapters').select('id, title_ru'),
    supabaseAdmin
      .from('transcripts')
      .select('short_title')
      .not('short_title', 'is', null)
      .neq('id', tx.id),
  ]);
  const chapterTitles = chapters?.map((c: { title_ru: string }) => c.title_ru) ?? [];
  const existingTitles = (existingTx ?? [])
    .map((t: { short_title: string | null }) => t.short_title)
    .filter(Boolean) as string[];

  try {
    const [polishRes, tagRes, summaryRes, titleRes] = await Promise.all([
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildPolishPrompt(mergedRaw) }],
      }),
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildTagPrompt(mergedRaw, chapterTitles) }],
      }),
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildSummaryPrompt(mergedRaw) }],
      }),
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildTitlePrompt(mergedRaw, existingTitles) }],
      }),
    ]);

    const polishedText = polishRes.choices[0].message.content ?? '';
    const taggedTitle = tagRes.choices[0].message.content?.trim() ?? '';
    const sessionSummary = summaryRes.choices[0].message.content ?? '';
    const shortTitle = titleRes.choices[0].message.content?.trim() || null;

    await supabaseAdmin
      .from('transcripts')
      .update({
        polished_text: polishedText,
        session_summary: sessionSummary,
        short_title: shortTitle,
        polished_at: new Date().toISOString(),
      })
      .eq('id', tx.id);

    const matchedChapter = chapters?.find(
      (c: { id: string; title_ru: string }) =>
        c.title_ru.toLowerCase() === taggedTitle.toLowerCase()
    );
    if (matchedChapter) {
      await supabaseAdmin
        .from('sessions')
        .update({ chapter_id: matchedChapter.id })
        .eq('id', sessionId);
    }

    return NextResponse.json({
      ok: true,
      transcript_id: tx.id,
      audio_ext: audio.ext,
      existing_raw_chars: existingRaw.length,
      audio_transcript_chars: audioTranscript.length,
      merged_raw_chars: mergedRaw.length,
      polished: !!polishedText,
      short_title: shortTitle,
      matched_chapter: matchedChapter?.title_ru ?? null,
    });
  } catch (pipelineErr) {
    console.error('[retranscribe] Pipeline failed (raw_text already saved):', pipelineErr);
    return NextResponse.json({
      ok: true,
      transcript_id: tx.id,
      raw_text_saved: true,
      pipeline_error: (pipelineErr as Error).message,
      hint: 'raw_text was updated successfully; you can re-run /api/transcript/reprocess to retry the polish step.',
    });
  }
}
