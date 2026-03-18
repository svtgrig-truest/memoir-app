# Memoir — голосовой мемуарный ассистент

Приложение для записи семейной истории через AI-интервью. Пожилой человек (Александр Григорьевич) разговаривает с ассистентом голосом; система транскрибирует беседу, полирует её в мемуарную прозу и сохраняет в семейный архив.

**Production:** https://memoir-app-lemon.vercel.app

---

## Стек

| Слой | Технология |
|---|---|
| Frontend | Next.js 15 (App Router), React 19 |
| Стили | Tailwind CSS v4, Framer Motion |
| Голос | OpenAI Realtime API (WebRTC) |
| AI pipeline | OpenAI GPT-4o (полировка, резюме, заголовки) |
| База данных | Supabase (PostgreSQL + RLS) |
| Аутентификация | Supabase Auth (семейный доступ по паролю) |
| Деплой | Vercel (auto-deploy из GitHub) |
| PDF экспорт | jsPDF |

---

## Архитектура

```
memoir-app/
├── app/
│   ├── page.tsx                  # Главная — голосовой интерфейс (орб)
│   ├── archive/
│   │   ├── page.tsx              # Список глав
│   │   ├── chapter/[id]/page.tsx # Сессии в главе
│   │   └── session/[id]/page.tsx # Детальная запись + TitleEditor
│   └── family/
│       ├── page.tsx              # Форма входа для семьи
│       └── dashboard/page.tsx    # Семейный архив
│
├── app/api/
│   ├── chapters/route.ts         # GET: главы (без free), lastChapterId
│   ├── session-token/route.ts    # POST: ephemeral token для OpenAI Realtime
│   ├── session-end/route.ts      # POST: закрыть сессию, запустить pipeline
│   ├── session-pause/route.ts    # POST: пауза сессии
│   ├── transcript/route.ts       # GET/PATCH: текст + short_title
│   ├── export/route.ts           # GET: PDF-экспорт главы
│   ├── family-auth/route.ts      # POST: семейный пароль → cookie
│   ├── heritage/route.ts         # GET: статистика для семейного архива
│   └── upload/route.ts           # POST: загрузка файлов
│
├── components/
│   └── TitleEditor.tsx           # Инлайн-редактор заголовка записи
│
├── lib/
│   ├── realtime.ts               # WebRTC-подключение, buildSystemPrompt, VAD, silence timer
│   ├── pipeline.ts               # Полировка/резюме/заголовки через GPT-4o
│   └── supabase.ts               # supabaseAdmin клиент (server-only)
```

---

## Ключевые механики

### Голосовая сессия
- Пользователь выбирает тему → нажимает орб → WebRTC соединяется с OpenAI Realtime API
- VAD (Voice Activity Detection): threshold 0.6, silence 1200 ms
- Таймер тишины 8 сек → ассистент задаёт следующий вопрос автоматически
- Параметр `?autostart=1` запускает сессию без нажатия; убирается из URL сразу через `replaceState` (не остаётся в истории браузера)

### Pipeline транскрипта
После завершения сессии (`/api/session-end`):
1. Подсчёт слов пользователя — если < 8, транскрипт не создаётся
2. Полировка разговора в мемуарную прозу (`buildPolishPrompt`)
3. Генерация краткого резюме (`buildSummaryPrompt`)
4. Генерация заголовка сессии (`buildTitlePrompt`)

Все три промпта содержат явный запрет на добавление деталей, не упомянутых пользователем.

### Архив
- Главы: Детство, Юность, Работа и карьера, Семья, Путешествия, Важные события
- Бейдж «Мы остановились здесь» — последняя сессия в главе
- Инлайн-редактирование заголовка записи (`TitleEditor`)

### Семейный доступ
- Отдельный маршрут `/family` с паролем
- Только чтение: архив, PDF-экспорт

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

```bash
npm run dev      # локально на :3000
```

Деплой: push в `main` → Vercel автоматически пересобирает и деплоит.

Изменения файлов производятся через GitHub API (curl + base64) из Replit-среды.
