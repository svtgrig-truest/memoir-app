# Memoir — голосовой мемуарный ассистент

Приложение для записи семейной истории через AI-интервью. Пожилой человек (Александр Григорьевич) разговаривает с ассистентом голосом; система транскрибирует беседу, полирует её в мемуарную прозу и сохраняет в семейный архив.

**Production:** https://memoir-app-lemon.vercel.app

---

## Стек

| Слой | Технология |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), React 19 |
| Стили | Tailwind CSS v4, Framer Motion |
| Голос | OpenAI Realtime API (WebRTC) |
| AI pipeline | OpenAI GPT-4o (полировка, резюме, заголовки); GPT-4o-mini (документы) |
| База данных | Supabase (PostgreSQL + RLS + Storage) |
| Аутентификация | Supabase Auth (семейный доступ по паролю) |
| Деплой | Vercel (auto-deploy из GitHub main) |
| PDF экспорт | jsPDF |

---

## Архитектура

```
memoir-app/
├── app/
│   ├── page.tsx                        # Главная — голосовой интерфейс (орб)
│   ├── archive/
│   │   ├── page.tsx                    # Список глав
│   │   ├── chapter/[id]/page.tsx       # Сессии в главе
│   │   └── session/[id]/page.tsx       # Детальная запись + TitleEditor
│   └── family/
│       ├── page.tsx                    # Форма входа для семьи
│       └── dashboard/
│           ├── page.tsx                # Семейный архив (только чтение)
│           └── heritage/page.tsx       # Семейные документы (загрузка PDF/DOCX/TXT)
│
├── app/api/
│   ├── session-token/route.ts          # Ephemeral token + system prompt (читает heritage docs)
│   ├── session-end/route.ts            # Закрыть сессию, pipeline: полировка/резюме/заголовок
│   ├── session-pause/route.ts          # Пауза сессии
│   ├── chapters/route.ts               # GET: главы (без free), lastChapterId
│   ├── transcript/route.ts             # GET/PATCH: текст + short_title
│   ├── export/route.ts                 # GET: PDF-экспорт главы
│   ├── family-auth/route.ts            # POST: семейный пароль → cookie
│   └── heritage/
│       ├── route.ts                    # POST: загрузить PDF/DOCX/TXT в Supabase Storage
│       └── reprocess/route.ts          # POST: перечитать документ заново
│
├── components/
│   ├── TitleEditor.tsx                 # Инлайн-редактор заголовка записи
│   └── HeritageDocCard.tsx             # Карточка документа: имя файла + ссылка
│
├── lib/
│   ├── realtime.ts                     # WebRTC, buildSystemPrompt, VAD, таймер тишины
│   ├── pipeline.ts                     # buildPolishPrompt / buildSummaryPrompt / buildTitlePrompt
│   └── supabase/server.ts              # supabaseAdmin (service role, server-only)
```

---

## Ключевые механики

### Голосовая сессия
- Пользователь выбирает тему → нажимает орб → WebRTC соединяется с OpenAI Realtime API
- VAD: threshold 0.6, silence 1200 ms; таймер тишины 8 сек → ассистент задаёт вопрос
- `?autostart=1` запускает сессию без нажатия; убирается через `replaceState` сразу

### Pipeline транскрипта
После завершения сессии (`/api/session-end`):
1. Подсчёт слов пользователя — если < 8, транскрипт не создаётся
2. Параллельно: полировка прозы, резюме, заголовок, определение главы
3. Заголовок генерируется с учётом уже существующих заголовков (нет повторений тем)

### Семейные документы (Heritage)
- Семья загружает PDF, DOCX или TXT — файл сохраняется в Supabase Storage
- При старте голосовой сессии API читает файлы по их URL через OpenAI Responses API и извлекает биографические факты (GPT-4o-mini)
- Результат кешируется в `heritage_docs.summary_text`; при повторных сессиях используется кеш
- Страница `/family/dashboard/heritage` показывает только название файла и ссылку

### Архив
- Главы: Детство, Юность, Работа и карьера, Семья, Путешествия, Важные события
- Бейдж «Мы остановились здесь» — последняя сессия в главе
- Инлайн-редактирование заголовка записи (`TitleEditor`)

---

## Переменные окружения

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
FAMILY_PASSWORD=
```

---

## База данных (Supabase)

| Таблица | Назначение |
|---|---|
| `chapters` | Темы разговора (display_order, theme, title_ru) |
| `sessions` | Голосовые сессии (chapter_id, started_at, ended_at) |
| `transcripts` | Полированный текст, резюме, short_title |
| `heritage_docs` | Семейные документы (filename, file_url, mime_type, summary_text) |

RLS включён. Все запросы из API-роутов используют `supabaseAdmin` (service role).

---

## Дизайн-токены

```css
--bg: #0d0b09
--bg-card: #1c1914
--accent: #d4a853
--text: #f0ece4
--text-muted: #7a6f62
--border: #2a2118
```

---

## Разработка и деплой

Push в `main` → Vercel автоматически пересобирает. Изменения файлов производятся через GitHub API из Replit-среды. Repo: `svtgrig-truest/memoir-app`.
