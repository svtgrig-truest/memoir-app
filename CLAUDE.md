# CLAUDE.md — memoir-app

## О проекте

Голосовой мемуарный ассистент. Пожилой человек (Александр Григорьевич) разговаривает с AI голосом; система транскрибирует беседы и публикует в семейный архив.

- **Production:** https://memoir-app-lemon.vercel.app
- **Деплой:** Vercel, auto-deploy из ветки `main`
- **Репозиторий:** `svtgrig-truest/memoir-app`

---

## Стек

- Next.js 16 (App Router, Turbopack), React 19
- Tailwind CSS v4, Framer Motion
- OpenAI Realtime API (WebRTC) — голос в реальном времени
- GPT-4o — полировка транскриптов, резюме, заголовки
- GPT-4o-mini — извлечение текста из семейных документов (меньше TPM ограничений)
- Supabase (PostgreSQL + RLS + Storage) — БД и аутентификация
- jsPDF — PDF-экспорт

---

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `app/page.tsx` | Главная: орб, чипы тем, autostart-логика |
| `lib/realtime.ts` | WebRTC подключение, `buildSystemPrompt`, VAD, таймер тишины |
| `lib/pipeline.ts` | `buildPolishPrompt`, `buildSummaryPrompt`, `buildTitlePrompt(rawText, existingTitles)`, `countUserWords` |
| `app/api/session-token/route.ts` | Ephemeral token + system prompt; читает heritage docs, извлекает текст через Responses API, кеширует |
| `app/api/session-end/route.ts` | Завершение сессии + pipeline (мин. 8 слов); передаёт existing titles в buildTitlePrompt |
| `app/api/heritage/route.ts` | POST: загрузить файл в Storage, сохранить запись (без GPT) |
| `app/api/heritage/reprocess/route.ts` | POST: перечитать файл через Responses API |
| `components/HeritageDocCard.tsx` | Карточка документа: только имя файла + ссылка |
| `components/TitleEditor.tsx` | Инлайн-редактор заголовка записи |
| `app/family/dashboard/heritage/page.tsx` | Страница семейных документов |

---

## Правила продукта (не менять без явного указания)

- AI обращается только «Александр Григорьевич» или «вы» — никаких «дорогой», «голубчик»
- Имя «Александр Григорьевич» — не чаще одного раза в несколько реплик
- Все промпты (`buildPolishPrompt`, `buildSummaryPrompt`, `buildTitlePrompt`) содержат явный запрет на добавление деталей, не упомянутых пользователем
- Если пользователь сказал **менее 8 слов** за сессию — транскрипт не создаётся
- Тема `free` исключена везде
- `?autostart=1` убирается через `window.history.replaceState` сразу после запуска

---

## Heritage-документы

**Загрузка:** `POST /api/heritage` → сохраняет файл в `supabase.storage('Media')/heritage/` + запись в `heritage_docs` с `summary_text = null`. Никакой обработки GPT при загрузке.

**Использование в сессии:** `session-token/route.ts` при каждом старте:
1. Читает `heritage_docs` (id, file_url, mime_type, filename, summary_text)
2. Если `summary_text` есть → использует кеш
3. Если нет → вызывает OpenAI Responses API с `file_url` + промпт извлечения фактов → кеширует в `summary_text`

**Промпт извлечения:** «Это частный семейный архив. Перечисли все биографические факты: имена, даты, события, места, семейные связи, должности, награды.» — формулировка как "фактический список", а не "пересказ/цитирование" (во избежание отказа GPT по авторскому праву).

**Страница:** только имя файла + ссылка, без превью текста.

---

## Title generation

`buildTitlePrompt(rawText, existingTitles)` принимает массив уже существующих заголовков.

Правила в промпте:
- Конкретность (место/человек/событие, не общая тема)
- Только первое слово с заглавной буквы (кроме имён собственных)
- Без кавычек, без эпитетов («яркий», «незабываемый»)
- 3–6 слов
- Список `existingTitles` передаётся как «не повторяй темы из этих названий»

`session-end` подгружает все существующие `short_title` из `transcripts` (кроме текущего) и передаёт в промпт.

---

## VAD и поведение голоса

- VAD threshold: `0.6`, silence duration: `1200 ms`
- Таймер тишины 8 сек → ассистент задаёт следующий вопрос

---

## База данных (Supabase)

| Таблица | Поля |
|---|---|
| `chapters` | `id`, `title_ru`, `theme`, `display_order` |
| `sessions` | `id`, `chapter_id`, `started_at`, `ended_at`, `status` |
| `transcripts` | `id`, `session_id`, `raw_text`, `polished_text`, `session_summary`, `short_title`, `polished_at` |
| `heritage_docs` | `id`, `filename`, `file_url`, `mime_type`, `summary_text`, `uploaded_at` |

- RLS включён на всех таблицах
- API-роуты используют `supabaseAdmin` (service role key) — никогда anon key в server-side коде

---

## Типичные TypeScript-ловушки в этом проекте

- `openai.files.delete()` — не `.del()` (было в v4, убрали в v6)
- `supabaseBuilder.then(() => {}, () => {})` — не `.catch()` (Supabase реализует `PromiseLike`, не `Promise`)
- `middleware.ts` — удалён, ломал Turbopack build в Next.js 16

---

## Переменные окружения

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
FAMILY_PASSWORD
```
