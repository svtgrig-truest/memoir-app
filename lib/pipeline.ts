import { TurnMessage } from '@/lib/realtime';

export function buildRawTranscript(messages: TurnMessage[]): string {
  return messages
    .map((m) => `${m.role === 'assistant' ? 'Интервьюер' : 'Папа'}: ${m.text}`)
    .join('\n\n');
}

/**
 * Count words spoken by the interviewee (role === 'user').
 * Used to decide whether a session has enough content to be worth saving.
 */
export function countUserWords(messages: TurnMessage[]): number {
  return messages
    .filter((m) => m.role === 'user')
    .reduce((sum, m) => sum + m.text.trim().split(/\s+/).filter(Boolean).length, 0);
}

export function buildPolishPrompt(rawTranscript: string): string {
  return `Ты литературный редактор. Твоя задача — превратить транскрипт разговора в связный мемуарный текст от первого лица.

ВАЖНЫЕ ПРАВИЛА — соблюдай строго:
1. Используй ТОЛЬКО то, что Папа сказал в разговоре. Не добавляй никаких деталей, событий, имён или фактов, которых нет в транскрипте.
2. Убери вопросы интервьюера и служебные фразы. Объедини ответы Папы в единый связный текст.
3. Сохрани голос, стиль и темп рассказчика — его слова, его интонации.
4. Отфильтруй слова-паразиты, оговорки, повторы — но не меняй смысл.
5. Если папа сказал мало — напиши мало. Лучше короткий честный текст, чем длинный выдуманный.
6. Пиши только на русском языке.

Транскрипт:
${rawTranscript}

Мемуарный текст:`;
}

export function buildTagPrompt(rawTranscript: string, chapterTitles: string[]): string {
  return `Прочитай транскрипт и определи наиболее подходящую главу мемуаров из списка ниже. Ответь только названием главы, без объяснений.

Главы: ${chapterTitles.join(', ')}

Транскрипт:
${rawTranscript.substring(0, 2000)}

Глава:`;
}

export function buildSummaryPrompt(rawTranscript: string): string {
  return `Напиши краткое резюме (2-4 предложения) того, о чём говорил собеседник в этом интервью. Опирайся ТОЛЬКО на то, что прямо сказано в транскрипте — не домысливай и не добавляй ничего от себя. Это резюме будет использовано в будущих сессиях.

Транскрипт:
${rawTranscript.substring(0, 3000)}

Резюме:`;
}

export function buildTitlePrompt(rawTranscript: string): string {
  return `Придумай короткое название (3–6 слов) для этого разговора-воспоминания. Название должно отражать главную тему или самый яркий момент из того, что РЕАЛЬНО было сказано. Не выдумывай. Отвечай только названием — без кавычек, без точки в конце.

Транскрипт:
${rawTranscript.substring(0, 1500)}

Название:`;
}
