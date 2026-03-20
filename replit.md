# Memoir App — рабочий контекст

## О проекте

Голосовой мемуарный ассистент для записи семейной истории. Пожилой человек (Александр Григорьевич) разговаривает с AI-ассистентом голосом; система транскрибирует беседы и публикует в семейный архив.

- **Репозиторий:** `svtgrig-truest/memoir-app` (GitHub)
- **Production:** https://memoir-app-lemon.vercel.app
- **Деплой:** Vercel — auto-deploy из ветки `main`
- **Stack:** Next.js 16.1.6, React 19, Supabase, OpenAI Realtime API (WebRTC), Framer Motion, Tailwind CSS v4

---

## Рабочий процесс (GitHub API)

Код живёт на GitHub, не в этом Replit-окружении. Все правки через GitHub API:

```bash
TOKEN=$GITHUB_PERSONAL_ACCESS_TOKEN
OWNER="svtgrig-truest"
REPO="memoir-app"

# Скачать файл
curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/contents/PATH" \
  | jq -r '.content' | base64 -d > /tmp/filename

# Закоммитить файл
SHA=$(curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/contents/PATH" | jq -r '.sha')
CONTENT=$(base64 -w 0 /tmp/filename)
curl -s -X PUT -H "Authorization: token $TOKEN" -H "Content-Type: application/json" \
  "https://api.github.com/repos/$OWNER/$REPO/contents/PATH" \
  -d "{\"message\":\"commit msg\",\"content\":\"$CONTENT\",\"sha\":\"$SHA\"}"
```

**CRITICAL — lock file:** Repo имеет `package-lock.json` → Vercel запускает `npm ci`. Нельзя запустить `npm install` из Replit. Новые зависимости требуют отдельного `npm install` локально с последующим коммитом lock-файла.

---

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `app/page.tsx` | Главная: орб, чипы тем, handleEnd с toast-уведомлениями, msgCount диагностика |
| `lib/realtime.ts` | WebRTC, buildSystemPrompt, VAD (2000ms silence), mic-only запись |
| `lib/pipeline.ts` | GPT-4o: buildPolishPrompt / buildSummaryPrompt / buildTitlePrompt / buildTagPrompt |
| `app/api/session-token/route.ts` | Ephemeral token; строит системный промпт с памятью (последние 8 бесед + heritage) |
| `app/api/session-end/route.ts` | Закрыть сессию + pipeline (min 8 слов) |
| `app/api/session/audio/route.ts` | GET: signed download URL; GET?intent=upload: signed upload URL для Supabase Storage |
| `app/api/export/route.ts` | Экспорт сессии: raw (.txt), polished (.txt), pdf (DejaVu Sans) |
| `app/api/export/book/route.ts` | Экспорт всей книги (все сессии в одном документе) |
| `app/api/chapters/route.ts` | GET: список тем; POST: создать новую тему (theme='custom') |
| `app/api/auth/route.ts` | POST: проверить пароль → выставить cookie `app_auth=1` на 30 дней |
| `app/api/heritage/route.ts` | POST: загрузить файл в Storage, запись в БД |
| `app/api/heritage/reprocess/route.ts` | POST: Responses API → извлечь текст → кешировать в `summary_text` |
| `app/api/transcript/reprocess/route.ts` | POST: повторный запуск pipeline для существующей сессии |
| `app/archive/layout.tsx` | Server layout: вызывает `requireAuth()`, защищает весь `/archive/` |
| `app/family/layout.tsx` | Server layout: вызывает `requireAuth()`, защищает весь `/family/` |
| `app/login/page.tsx` | Страница входа — для редиректов с server pages |
| `lib/auth.ts` | `requireAuth()`: cookies() → redirect('/login') если нет `app_auth` |
| `components/LoginGate.tsx` | Инлайн-форма пароля для client pages (главная) |
| `components/AudioPlayer.tsx` | Плеер + скачивание аудио через JS blob (обход CORS download) |
| `components/RetryPolishButton.tsx` | Кнопка «Обработать» — повторный запуск pipeline |
| `components/BookEditor.tsx` | Просмотр/редактирование/скачивание полной книги |
| `components/TitleEditor.tsx` | Инлайн-редактор заголовка записи |
| `instrumentation.ts` | Создаёт Supabase Storage bucket `recordings` при старте сервера |

---

## Аутентификация

Все страницы защищены паролем (переменная `FAMILY_PASSWORD` в Vercel).

- `/login` — страница входа для server-side редиректов
- `lib/auth.ts` — `requireAuth()`: проверяет cookie `app_auth=1`, редиректит на `/login` если нет
- `app/archive/layout.tsx` и `app/family/layout.tsx` — server layouts, вызывают `requireAuth()`
- `app/page.tsx` — client component, проверяет cookie через `document.cookie`, показывает `<LoginGate>` если нет
- `components/LoginGate.tsx` — инлайн-форма ввода пароля
- `app/api/auth/route.ts` — POST: проверяет пароль, ставит cookie `app_auth=1` на 30 дней (не httpOnly)

---

## Голосовая сессия (WebRTC flow)

1. Клик на орб → `POST /api/session-token` → получает ephemeral OpenAI token + `session_id` + `system_prompt`
2. `connectToRealtime()` в `lib/realtime.ts`:
   - RTCPeerConnection + аудио элемент в DOM
   - Микрофон через `getUserMedia`
   - **Запись:** `MediaRecorder(stream)` — только mic, без AudioContext (избегает помех с AI-аудио)
   - Data channel `oai-events` → `session.update` с VAD config + system prompt
   - Barge-in: при `input_audio_buffer.speech_started` и `isAIResponding=true` → `response.cancel`
   - SDP handshake с OpenAI Realtime API
3. По окончании `handleEnd()` в `app/page.tsx`:
   - `conn.stopRecording()` → blob
   - Disconnect WebRTC
   - `POST /api/session-end` с транскриптом (min 8 слов → pipeline)
   - Toast: «Сохраняю запись...» → «Запись сохранена ✓» / «Разговор слишком короткий»
   - Аудио: GET `/api/session/audio?intent=upload` → signed URL → PUT blob прямо в Supabase Storage (обход 4.5 MB лимита Vercel)

**Память AI между сессиями:**
- `session-token` читает последние 8 транскриптов с `polished_text + short_title + session_summary`
- Первые 2 → передаются как `recentTranscripts` (полный текст, до 3 500 символов каждый) → раздел промпта «ПОСЛЕДНИЕ БЕСЕДЫ — ПОЛНЫЙ КОНТЕКСТ»
- Записи 3–8 → только `session_summary` → раздел «УЖЕ ИЗВЕСТНЫЕ ФАКТЫ ИЗ ПРОШЛЫХ РАЗГОВОРОВ»
- AI знает дословно содержание двух последних бесед и может на них ссылаться

**VAD config:**
```json
{
  "type": "server_vad",
  "silence_duration_ms": 2000,
  "threshold": 0.6,
  "prefix_padding_ms": 300,
  "create_response": true
}
```

---

## Heritage-документы (архитектура)

1. **Загрузка** (`POST /api/heritage`): файл → Supabase Storage (`Media/heritage/`) + запись в `heritage_docs` с `summary_text = null`
2. **Обработка** (`POST /api/heritage/reprocess`): кнопка «Обработать» на странице `/family/dashboard/heritage` → Responses API (gpt-4o-mini) + файл через Files API → извлекает биографические факты → кеширует в `summary_text`
3. **Сессия** (`session-token`): читает готовый `summary_text` из БД — GPT **не вызывается** при старте сессии
4. **Страница** `/family/dashboard/heritage`: карточки документов с именем, кнопкой «Скачать», статусом обработки

**Промпт извлечения:** формулируется как «биографический указатель / фактический список» — GPT не отказывает по политике авторского права.

---

## Аудиозаписи

- **Bucket:** `recordings` в Supabase Storage (создаётся через `instrumentation.ts`)
- **Путь:** `recordings/{session_id}.webm` (или .mp4, .ogg в зависимости от браузера)
- **Загрузка:** браузер → GET `/api/session/audio?intent=upload&session_id=...&mime=...` → signed URL → PUT blob прямо в Supabase (без Vercel)
- **Воспроизведение:** `AudioPlayer` компонент — GET `/api/session/audio?session_id=...` → signed download URL → `<audio controls>`
- **Скачивание:** `AudioPlayer` делает `fetch(url)` → `blob()` → `URL.createObjectURL()` → программный click на `<a download>` (обход CORS-ограничения атрибута download)

---

## Экспорт

- `GET /api/export?session_id=...&type=raw` → .txt оригинал транскрипта
- `GET /api/export?session_id=...&type=polished` → .txt отполированный текст
- `GET /api/export?session_id=...&type=pdf` → PDF с кириллицей (шрифт DejaVu Sans через jsDelivr CDN)
- `GET /api/export/book?type=polished` → полная книга (все сессии)
- Все ответы используют `new Response(body, {headers})` (не `new NextResponse`) с явным `Content-Disposition`

---

## Заголовки записей

`buildTitlePrompt(rawText, existingTitles[])` — передаём все существующие `short_title`.

Правила: конкретность (место/человек/событие), только первое слово с заглавной, без кавычек и эпитетов, не повторять из `existingTitles`.

---

## Типичные TypeScript-ловушки

- **`supabaseBuilder.catch()`** — ошибка TS! Supabase v2 возвращает `PromiseLike`, не `Promise`. Нет метода `.catch()`. Использовать `await` + try/catch или `.then(undefined, handler)`
- **`let x: T | null = null` без переприсваивания** → TypeScript сужает тип до `null` → вызов `x?.()` даёт `Type 'never' has no call signatures` (TS2349). Решение: убрать мёртвый код или присвоить значение
- **`openai.files.delete()`** — не `.del()` (убрали в v6 SDK)
- **`middleware.ts`** — удалён, ломал Turbopack build в Next.js 16
- **Cross-origin `download`** — браузер игнорирует атрибут `download` для cross-origin URLs. Обходить через `fetch` → blob → `createObjectURL`
- **Vercel body limit 4.5 MB** — аудио загружать напрямую в Supabase через signed upload URL, не через API-роут

---

## Дизайн-токены

```
--bg: #0d0b09        (фон страницы)
--bg-card: #1c1914   (карточки)
--accent: #d4a853    (золотой акцент)
--text: #f0ece4      (основной текст)
--text-muted: #7a6f62
--border: #2a2118
```

---

## Системный промпт (buildSystemPrompt в lib/realtime.ts)

**Цель AI:** написать книгу воспоминаний, охватывающую все периоды и стороны жизни — детство, юность, учёбу, работу, семью, дружбу, исторические события, личные переживания.

**Секции промпта (в порядке добавления):**
- `chapterContext` — тема беседы (если выбрана) или хронологическая инструкция
- `heritageSection` — «ФОНОВЫЕ ЗНАНИЯ»: держать как тихий контекст, **не упоминать в вопросах по инициативе AI**, особенно в начале. Только углублять когда сам собеседник выходит на тему
- `recentSection` — полный текст последних 2 бесед (память)
- `summarySection` — краткие резюме бесед 3–8 (не повторять)
- `greetingSection` — инструкция по началу беседы:
  - Первая беседа вообще: открытый вопрос «с чего хотелось бы начать», детство — как один из вариантов
  - По теме с историей: напомнить о прошлой беседе
  - По новой теме: открыть тему мягко
  - Продолжение без темы: продолжить хронологию

**ХРОНОЛОГИЧЕСКАЯ СТРАТЕГИЯ:** вести запись последовательно — детство → юность → взрослая жизнь. Исторические события уместны только когда сам собеседник к ним приходит.

---

## Важные правила продукта

- AI обращается только «Александр Григорьевич» / «вы» — никаких «дорогой», «уважаемый»
- Промпты запрещают AI додумывать детали, не упомянутые пользователем
- Если пользователь сказал < 8 слов — транскрипт не создаётся (session-end возвращает `skipped: true`)
- Нарратор всегда мужского рода («был», «рассказал»)
- `?autostart=1` убирается через `window.history.replaceState` сразу после запуска
- Тема `free` исключена везде

---

## Переменные окружения

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
FAMILY_PASSWORD
```

---

## Структура Replit-воркспейса

Этот Replit — вспомогательная среда для работы с GitHub API. Сам Next.js-проект не запускается здесь. Локальные workflows (`api-server`, `mockup-sandbox`) — шаблонные артефакты, не относящиеся к memoir-app.
