import { TurnMessage } from '@/lib/realtime';

export function buildRawTranscript(messages: TurnMessage[]): string {
  return messages
    .map((m) => `${m.role === 'assistant' ? 'Интервьюер' : 'Папа'}: ${m.text}`)
    .join('\n\n');
}

export function buildPolishPrompt(rawTranscript: string): string {
  return `Ты литературный редактор. Преврати следующий транскрипт разговора в связный мемуарный текст от первого лица. Сохрани голос и стиль рассказчика. Убери вопросы интервьюера, отфильтруй слова-паразиты. Пиши на русском языке.

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
  return `Напиши краткое резюме (3-5 предложений) того, о чём говорилось в этом интервью. Укажи имена, места, даты и ключевые события. Это резюме будет использовано в будущих сессиях интервью.

Транскрипт:
${rawTranscript.substring(0, 3000)}

Резюме:`;
}

export function buildTitlePrompt(rawTranscript: string): string {
  return `Придумай короткое название (3–6 слов) для этого разговора-воспоминания. Название должно отражать главную тему или самый яркий момент. Отвечай только названием — без кавычек, без точки в конце.

Транскрипт:
${rawTranscript.substring(0, 1500)}

Название:`;
}
