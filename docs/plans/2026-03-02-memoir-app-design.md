# Memoir App — Design Doc
_Создан: 2026-03-02 · Обновлён: 2026-03-18_

## Overview

Голосовое веб-приложение, которое записывает воспоминания пожилого русскоязычного человека в форме интервью с AI, транскрибирует и редактирует беседы в мемуарный текст, и предоставляет семье доступ к архиву.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, React 19) |
| Hosting | Vercel |
| Database + Auth + Storage | Supabase |
| Voice AI | OpenAI Realtime API (`gpt-4o-realtime-preview`, WebRTC) |
| Post-processing AI | GPT-4o (polish, tagging, summarization) |
| Styling | Tailwind CSS v4, Framer Motion |
| PDF export | jsPDF |
| Language | Русский по умолчанию |

---

## Users & Access

| User | Access |
|---|---|
| Dad | Закладка на главную — без логина, сразу голосовой интерфейс |
| Семья | `/family` — один общий пароль (`FAMILY_PASSWORD`) |

---

## Design System

Тёплая, ностальгическая палитра. Приложение о драгоценных воспоминаниях — дизайн должен это отражать.

| Токен | Значение | Применение |
|---|---|---|
| `--bg` | `#0d0b09` | Фон страниц |
| `--bg-card` | `#1c1914` | Карточки, панели |
| `--accent` | `#d4a853` | Акцент, активные элементы |
| `--accent-dim` | `rgba(212,168,83,0.12)` | Фон активных чипов |
| `--text` | `#f0ece4` | Основной текст |
| `--text-muted` | `#7a6f62` | Вторичный текст, подписи |
| `--border` | `#2a2118` | Разделители, рамки |

Шрифт: Geist (подключён через `next/font`).

---

## Dad's Interface

Голос — единственное главное действие. Интерфейс не должен отвлекать.

### Главный экран

**Хедер:**
- Название «Memoir» (янтарный)
- Ссылка «Семейный архив →» справа

**Выбор темы (всегда виден):**
- Горизонтальный ряд чипов-пилюль: «Свободный разговор» + все главы
- Активный чип выделен янтарём
- Выбор заблокирован во время активной сессии
- _(Ранее был hamburger-menu → скрытый sidebar. Убрано как неочевидное)_

**Орб:**
- Янтарный градиент `#e8c06a → #c9893a → #8b4e1a` с мягким свечением
- Состояния: idle / listening / speaking / thinking — разные анимации
- Подпись под орбом: «Нажмите, чтобы начать» / «Слушаю вас...» / «Думаю...» / «Отвечаю...»
- Нажатие запускает голосовую сессию

**Управление сессией (появляется только во время активной сессии):**
- 📷 **Фото** — прикрепить фото или файл к текущей сессии
- ⏸ **Пауза** — сохранить, продолжить позже
- ✕ **Завершить** — закрыть сессию, запустить постобработку
- _(Ранее была постоянная TextInputBar с текстовым полем + иконками. Убрано — конкурировала с орбом. Фото перемещены в контекст сессии)_

---

## Family Interface (`/family`)

### Страница входа

- Логотип «Memoir», подзаголовок «Семейный архив»
- Форма с паролем
- Ссылка «← Вернуться к записи»

### Дашборд (`/family/dashboard`)

- Счётчик всех записей в хедере
- Секции по главам — только те, где есть завершённые записи
- Каждая секция: название главы + количество записей
- Записи: дата → ссылка на страницу сессии
- Секция «Свободные разговоры» для записей без темы
- Пустое состояние: кнопка «Начать первый разговор» → главная
- Ссылка на раздел документов

### Страница сессии (`/family/dashboard/session/[id]`)

- Хлебные крошки: «← Назад к архиву»
- Заголовок: тема + дата
- Кнопки экспорта:
  - **Скачать PDF** (акцентный стиль) — полная история
  - **История .txt** — литературная версия
  - **Разговор .txt** — оригинальный транскрипт
- `TranscriptViewer`: по умолчанию вкладка «История» (литературная версия)
  - Переключение: История / Разговор / Оба

### Документы (`/family/dashboard/heritage`)

- Загрузка семейных документов (PDF, Word, фото, txt)
- Список загруженных документов с превью summary
- Статус: «Готов» (✓ янтарь) / «Обработка» (🕐 серый)

---

## Data Model

```sql
chapters
  id, title_ru, display_order
  theme (childhood | youth | career | family | travel | events | free | custom)

sessions
  id, chapter_id (nullable — auto-tagged post-session)
  started_at, ended_at
  status (active | paused | complete)

session_media
  id, session_id, file_url, mime_type, ai_caption

transcripts
  id, session_id
  raw_text          -- verbatim from Realtime API
  polished_text     -- GPT-4o memoir prose
  session_summary   -- GPT-4o summary injected into future sessions
  polished_at

comments
  id, transcript_id, anchor_text, body, created_at
  -- schema ready, UI not yet built

heritage_docs
  id, filename, file_url, mime_type
  summary_text      -- one-time GPT-4o extraction, injected into every system prompt
  uploaded_at
```

---

## AI Design

### Realtime API (voice session)

**Ephemeral token flow:**
1. Dad нажимает орб → браузер вызывает `/api/session-token`
2. Сервер генерирует короткоживущий токен (ключ OpenAI не покидает сервер)
3. Браузер открывает WebRTC соединение напрямую с OpenAI Realtime API
4. Разговор полностью в браузере; транскрипт сохраняется в Supabase

**System prompt:**

```
Ты тёплый, любопытный, эмпатичный интервьюер, помогающий [имя]
записать историю его жизни. Говори только по-русски.

Контекст семьи:
[summaries from heritage_docs]

Предыдущие беседы:
[session_summary values from recent sessions]

Цель текущей беседы:
[если выбрана глава: исследуй тему — [theme]; иначе: следуй за рассказчиком]

Правила:
- Задавай только один вопрос за раз
- Активное слушание: отражай сказанное перед следующим вопросом
- Если тишина >8 секунд, мягко спроси: "Расскажи подробнее..."
- Если упоминается имя/место/дата из семейных документов — углубляйся
- Никогда не торопи, не поправляй
- После ~40 минут мягко предложи завершить беседу
```

### Post-session pipeline (triggered on End)

1. **Сохранить raw transcript** → `transcripts.raw_text`
2. **Авто-тег главы** — GPT-4o присваивает `chapter_id` если не выбрана
3. **Литературная обработка** — GPT-4o → `transcripts.polished_text`
4. **Краткое резюме** — GPT-4o → `transcripts.session_summary` (вставляется в будущие промпты)

### Heritage docs pipeline (on upload)

- Однократный GPT-4o вызов извлекает плотное резюме
- Хранится в `heritage_docs.summary_text`
- Вставляется в system prompt каждой сессии

---

## Build Phases

| Phase | Deliverable | Статус |
|---|---|---|
| 1 | Scaffold: Next.js, Supabase schema, orb UI | ✅ Готово |
| 2 | Voice: ephemeral tokens, Realtime API, session saved | ✅ Готово |
| 3 | AI interviewer: system prompt, Russian persona | ✅ Готово |
| 4 | Post-session pipeline: tagging, polish, summarization | ✅ Готово |
| 5 | Media input: photo/file attach, AI acknowledgement | ✅ Готово |
| 6 | Family view: auth, transcript viewer, export (txt + PDF) | ✅ Готово |
| 7 | Heritage docs: upload → GPT-4o summary → injected into prompt | ✅ Готово |
| 8 | **UX redesign**: warm palette, visible chapters, orb labels, photo button | ✅ Готово (2026-03-18) |
| 9 | Full-book PDF: all chapters as one PDF | 🔲 Backlog |
| 10 | Comments: family annotates transcript inline | 🔲 Backlog |
| 11 | Push notifications: family notified on new session | 🔲 Backlog |
| 12 | Progress hints: voice cue when topics haven't been covered | 🔲 Backlog |

---

## Open Questions / Backlog

### Нерешённые вопросы
- **Кириллица в PDF**: jsPDF использует Helvetica (Latin only). Для корректного русского текста нужен либо кириллический шрифт в jsPDF, либо переход на Puppeteer.
- **Фото в PDF**: как встраивать прикреплённые фото в финальный PDF (расположение, подписи).
- **«Новая тема»**: кнопка на главной пока не работает (UI есть, логика не реализована).
- **Возобновление паузы**: сессия сохраняется со статусом `paused`, но UI для продолжения не реализован.

### Backlog фичи
- Full-book PDF — экспорт всей книги целиком
- Комментарии семьи — привязанные к фрагментам текста (схема БД готова)
- Push-уведомления семье при новой записи
- Голосовая подсказка папе: какие темы ещё не охвачены
- Страница прогресса: сколько глав записано, сколько осталось
