# CLAUDE.md — memoir-app

## О проекте

Голосовой мемуарный ассистент. Пожилой человек (Александр Григорьевич) разговаривает с AI голосом; система транскрибирует беседы и публикует в семейный архив.

- **Production:** https://memoir-app-lemon.vercel.app
- **Деплой:** Vercel, auto-deploy из ветки `main`

---

## Стек

- Next.js 15 (App Router), React 19
- Tailwind CSS v4, Framer Motion
- OpenAI Realtime API (WebRTC) — голос в реальном времени
- GPT-4o — полировка транскриптов, резюме, заголовки
- Supabase (PostgreSQL + RLS) — БД и аутентификация
- jsPDF — PDF-экспорт

---

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `app/page.tsx` | Главная: орб, чипы тем, autostart-логика |
| `lib/realtime.ts` | WebRTC подключение, `buildSystemPrompt`, VAD, таймер тишины |
| `lib/pipeline.ts` | GPT-4o: `buildPolishPrompt`, `buildSummaryPrompt`, `buildTitlePrompt`, `countUserWords` |
| `app/api/session-end/route.ts` | Завершение сессии + запуск pipeline (мин. 8 слов) |
| `app/api/chapters/route.ts` | GET глав (исключает `theme=free`), возвращает `lastChapterId` |
| `app/api/transcript/route.ts` | GET/PATCH транскрипта + `short_title` |
| `components/TitleEditor.tsx` | Инлайн-редактор заголовка записи (client component) |
| `app/archive/chapter/[id]/page.tsx` | Список сессий в главе, бейдж «Мы остановились здесь» |
| `app/archive/session/[id]/page.tsx` | Детальная запись с TitleEditor |
| `app/family/dashboard/page.tsx` | Семейный архив (только чтение) |

---

## Правила продукта (не менять без явного указания)

- AI обращается только «Александр Григорьевич» или «вы» — никаких «дорогой», «голубчик» и т.д.
- Имя «Александр Григорьевич» — не чаще одного раза в несколько реплик
- Все промпты (`buildPolishPrompt`, `buildSummaryPrompt`, `buildTitlePrompt`) содержат явный запрет на добавление деталей, не упомянутых пользователем
- Если пользователь сказал **менее 8 слов** за сессию — транскрипт не создаётся (`MIN_USER_WORDS = 8` в `session-end`)
- Тема `free` исключена везде: в API (`theme != 'free'`), архиве, семейном дашборде
- После autostart параметр `?autostart=1` немедленно убирается через `window.history.replaceState` — чтобы кнопка «Назад» не перезапускала сессию

---

## VAD и поведение голоса

- VAD threshold: `0.6`, silence duration: `1200 ms`
- Таймер тишины 8 сек после `response.audio.done` → ассистент задаёт следующий вопрос
- Перед `response.create` очищается `input_audio_buffer` с задержкой 200 мс (фикс двойного приветствия)

---

## База данных (Supabase)

| Таблица | Поля |
|---|---|
| `chapters` | `id`, `title_ru`, `theme`, `display_order` |
| `sessions` | `id`, `chapter_id`, `started_at`, `ended_at`, `raw_transcript` |
| `transcripts` | `id`, `session_id`, `polished_text`, `summary`, `short_title` |

- RLS включён на всех таблицах
- API-роуты используют `supabaseAdmin` (service role key) — никогда anon key в server-side коде

---

## Дизайн-токены (CSS переменные)

```
--bg: #0d0b09
--bg-card: #1c1914
--accent: #d4a853
--text: #f0ece4
--text-muted: #7a6f62
--border: #2a2118
```

---

## Переменные окружения

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
FAMILY_PASSWORD
```
