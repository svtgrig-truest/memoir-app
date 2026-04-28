/**
 * Standalone recovery script — recover a single session whose raw_text is
 * missing user content, using the mic-only audio backup in Supabase Storage.
 *
 * This is the same logic as POST /api/transcript/retranscribe, but runnable
 * locally without deploying. Useful for one-off recoveries.
 *
 * Usage:
 *   npx tsx scripts/recover-session.ts <session_id> [--commit]
 *
 *   Without --commit: dry run, prints the merged transcript and exits without
 *   writing anything.
 *   With --commit:    writes the merged raw_text to Supabase, re-runs the
 *   polish/tag/summary/title pipeline.
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import OpenAI, { toFile } from 'openai';
import {
  buildPolishPrompt,
  buildTagPrompt,
  buildSummaryPrompt,
  buildTitlePrompt,
} from '../lib/pipeline';

// ── Load .env.local manually (tsx doesn't auto-load it) ─────────────────
function loadDotEnvLocal(): void {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}
loadDotEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error('Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY in .env.local');
  process.exit(1);
}

const sessionId = process.argv[2];
const commit = process.argv.includes('--commit');

if (!sessionId) {
  console.error('Usage: npx tsx scripts/recover-session.ts <session_id> [--commit]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: OPENAI_KEY });

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

async function findAudio(sid: string): Promise<{ ext: string; blob: Blob } | null> {
  for (const ext of AUDIO_EXTENSIONS) {
    const { data } = await supabase.storage.from(BUCKET).download(`${sid}.${ext}`);
    if (data) return { ext, blob: data };
  }
  return null;
}

async function main() {
  console.log(`[recover] session_id=${sessionId}`);
  console.log(`[recover] mode=${commit ? 'COMMIT (will write to DB)' : 'DRY RUN (no writes)'}`);
  console.log('');

  // 1. Fetch transcript
  const { data: tx, error: txErr } = await supabase
    .from('transcripts')
    .select('id, raw_text, session_id')
    .eq('session_id', sessionId)
    .single();

  if (txErr || !tx) {
    console.error('No transcript found:', txErr?.message);
    process.exit(1);
  }
  console.log(`[recover] transcript id=${tx.id}, existing raw_text length=${tx.raw_text?.length ?? 0} chars`);

  // 2. Find audio
  const audio = await findAudio(sessionId);
  if (!audio) {
    console.error('No audio recording found in Storage');
    process.exit(1);
  }
  console.log(`[recover] audio found: ${sessionId}.${audio.ext}, ${audio.blob.size} bytes`);

  // 3. Whisper
  console.log('[recover] sending to Whisper...');
  const audioBuffer = Buffer.from(await audio.blob.arrayBuffer());
  const audioFile = await toFile(audioBuffer, `${sessionId}.${audio.ext}`, {
    type: audio.blob.type || `audio/${audio.ext}`,
  });
  const result = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file: audioFile,
    language: 'ru',
    response_format: 'text',
  });
  const audioTranscript = (typeof result === 'string' ? result : (result as { text?: string }).text ?? '').trim();
  console.log(`[recover] audio transcript: ${audioTranscript.length} chars`);
  console.log('');
  console.log('─── AUDIO TRANSCRIPT (Papa-only voice) ───────────────────────');
  console.log(audioTranscript);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');

  // 4. Merge
  console.log('[recover] merging with existing raw_text via GPT-4o...');
  const mergeRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: buildMergePrompt(tx.raw_text ?? '', audioTranscript) }],
  });
  const mergedRaw = mergeRes.choices[0].message.content?.trim() ?? '';
  const delta = mergedRaw.length - (tx.raw_text?.length ?? 0);
  console.log(`[recover] merged raw_text: ${mergedRaw.length} chars (delta: ${delta >= 0 ? '+' : ''}${delta})`);
  console.log('');
  console.log('─── EXISTING raw_text ────────────────────────────────────────');
  console.log(tx.raw_text);
  console.log('');
  console.log('─── MERGED raw_text (proposed) ───────────────────────────────');
  console.log(mergedRaw);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');

  if (!commit) {
    console.log('[recover] DRY RUN — nothing written. Re-run with --commit to apply.');
    return;
  }

  // 5. Persist
  console.log('[recover] writing merged raw_text...');
  const { error: updErr } = await supabase
    .from('transcripts')
    .update({ raw_text: mergedRaw })
    .eq('id', tx.id);
  if (updErr) {
    console.error('Failed to update raw_text:', updErr.message);
    process.exit(1);
  }

  // 6. Pipeline
  console.log('[recover] running polish / tag / summary / title pipeline...');
  const [{ data: chapters }, { data: existingTx }] = await Promise.all([
    supabase.from('chapters').select('id, title_ru'),
    supabase.from('transcripts').select('short_title').not('short_title', 'is', null).neq('id', tx.id),
  ]);
  const chapterTitles = chapters?.map((c: { title_ru: string }) => c.title_ru) ?? [];
  const existingTitles = (existingTx ?? [])
    .map((t: { short_title: string | null }) => t.short_title)
    .filter(Boolean) as string[];

  const [polishRes, tagRes, summaryRes, titleRes] = await Promise.all([
    openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: buildPolishPrompt(mergedRaw) }] }),
    openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: buildTagPrompt(mergedRaw, chapterTitles) }] }),
    openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: buildSummaryPrompt(mergedRaw) }] }),
    openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: buildTitlePrompt(mergedRaw, existingTitles) }] }),
  ]);

  const polishedText = polishRes.choices[0].message.content ?? '';
  const taggedTitle = tagRes.choices[0].message.content?.trim() ?? '';
  const sessionSummary = summaryRes.choices[0].message.content ?? '';
  const shortTitle = titleRes.choices[0].message.content?.trim() || null;

  await supabase.from('transcripts').update({
    polished_text: polishedText,
    session_summary: sessionSummary,
    short_title: shortTitle,
    polished_at: new Date().toISOString(),
  }).eq('id', tx.id);

  const matchedChapter = chapters?.find(
    (c: { id: string; title_ru: string }) => c.title_ru.toLowerCase() === taggedTitle.toLowerCase()
  );
  if (matchedChapter) {
    await supabase.from('sessions').update({ chapter_id: matchedChapter.id }).eq('id', sessionId);
  }

  console.log('');
  console.log(`[recover] DONE. short_title="${shortTitle}", chapter="${matchedChapter?.title_ru ?? '(none)'}"`);
}

main().catch((err) => {
  console.error('[recover] fatal:', err);
  process.exit(1);
});
