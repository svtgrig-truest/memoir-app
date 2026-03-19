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
1. Рассказчик — мужчина (Александр Григорьевич). Всегда используй мужской род: «я рос», «я был», «я видел», «я помню» — никогда «росла», «была», «видела».
2. Используй ТОЛЬКО то, что Папа сказал в разговоре. Не добавляй никаких деталей, событий, имён или фактов, которых нет в транскрипте.
3. Убери вопросы интервьюера и служебные фразы. Объедини ответы Папы в единый связный текст.
4. Сохрани голос, стиль и темп рассказчика — его слова, его интонации.
5. Отфильтруй слова-паразиты, оговорки, повторы — но не меняй смысл.
6. Если папа сказал мало — напиши мало. Лучше короткий честный текст, чем длинный выдуманный.
7. Пиши только на русском языке.

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

export function buildTitlePrompt(rawTranscript: string, existingTitles: string[] = []): string {
  const avoidBlock = existingTitles.length
    ? `\nУже существующие названия (не повторяй темы и формулировки из них):\n${existingTitles.map((t) => `— ${t}`).join('\n')}\n`
    : '';

  return `Придумай короткое название (3–6 слов) для этого разговора-воспоминания.

ПРАВИЛА:
— Отражай только то, что РЕАЛЬНО обсуждалось в транскрипте. Не выдумывай.
— Будь конкретным: укажи место, человека или событие, а не общую тему ("Как мы ездили к дяде Феде" лучше, чем "Семейные воспоминания").
— Только первое слово с заглавной буквы. Остальные — строчные (кроме имён собственных).
— Без кавычек, без точки в конце, без артиклей-эпитетов вроде "яркий", "незабываемый".
— 3–6 слов.${avoidBlock}
Транскрипт:
${rawTranscript.substring(0, 1500)}

Название:`;
}
