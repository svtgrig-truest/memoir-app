# Memoir App — Design Doc
_2026-03-02_

## Overview

A voice-first web app that interviews an 80-year-old Russian-speaking man about his life, transcribes and polishes the sessions into a memoir, and makes the result accessible to family.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (React) |
| Hosting | Vercel (one deployment, one URL) |
| Database + Auth + Storage | Supabase |
| Voice AI | OpenAI Realtime API (`gpt-4o-realtime-preview`) |
| Post-processing AI | GPT-4o (polish, tagging, summarization) |
| Language | Russian throughout |

---

## Users & Access

| User | Access method |
|---|---|
| Dad | Bookmarked direct link — no login, straight to voice interface |
| Family (admin + readers) | `/family` route — single shared password |

---

## Dad's Interface

Modeled after Gemini / ChatGPT voice mode. Voice-first, zero cognitive load.

### Main screen

- Animated orb (pulsing = AI speaking, rippling = dad speaking, slow glow = idle)
- Tap orb to start / stop speaking
- **Pause** button — saves session, resumes later
- **End** button — closes session, triggers post-processing
- Text input bar (always visible at bottom) with:
  - 📎 Attach photos from gallery or files
  - 🎤 Toggle mic
- ☰ hamburger — opens chapter sidebar

### Chapter sidebar (hidden by default)

- List of all chapters with ✓ if they have sessions
- `+ Новая тема` — dad can suggest his own topic
- Tapping a chapter sets the AI's focus for the current session

---

## Family Interface (`/family`)

- Chapter + session browser
- Per-session view:
  - Raw transcript (verbatim) and polished memoir prose — side by side
  - Inline comments (anchored to text)
- Export options:
  - Per session: raw transcript (`.txt`), polished prose (`.txt`)
  - Per chapter: polished chapter as PDF
  - Full book: all chapters as PDF
- Heritage doc upload section — PDFs, Word docs, scanned notes

---

## Data Model

```sql
users
  id, email, role (admin | family)
  -- dad has no account

chapters
  id, title_ru, display_order
  theme (childhood | youth | career | family | travel | events | free | custom)

sessions
  id, chapter_id (nullable — auto-tagged post-session)
  started_at, ended_at
  status (active | paused | complete)

messages
  id, session_id, role (user | assistant)
  content_type (text | audio_transcript | image | file)
  content_text, file_url, created_at

session_media
  id, session_id, file_url, mime_type, ai_caption

transcripts
  id, session_id
  raw_text          -- verbatim from Realtime API
  polished_text     -- GPT-4o memoir prose
  session_summary   -- GPT-4o summary injected into future sessions
  polished_at

comments
  id, transcript_id, user_id, anchor_text, body, created_at

heritage_docs
  id, filename, file_url, mime_type
  summary_text      -- one-time GPT-4o extraction, injected into every system prompt
  uploaded_at
```

---

## AI Design

### Realtime API (voice session)

**Ephemeral token flow:**
1. Dad taps orb → browser calls `/api/session-token`
2. Server generates short-lived token using OpenAI API key (key never leaves server)
3. Browser opens WebSocket directly to OpenAI Realtime API using token
4. Conversation runs fully in-browser; transcript streamed to Supabase

**System prompt structure:**

```
Ты тёплый, любопытный, эмпатичный интервьюер, помогающий [имя]
записать историю его жизни. Говори только по-русски.

Контекст семьи:
[summaries from heritage_docs]

Предыдущие беседы:
[session_summary values from recent sessions]

Цель текущей беседы:
[if chapter selected: исследуй тему — [theme]; else: следуй за тем, что хочет рассказать собеседник]

Правила:
- Задавай только один вопрос за раз
- Активное слушание: отражай сказанное перед следующим вопросом
- Если тишина >8 секунд, мягко спроси: "Расскажи подробнее..."
- Если упоминается имя/место/дата из документов о семье — копай глубже
- Никогда не торопи, не поправляй
- После ~40 минут мягко предложи завершить беседу
```

### Post-session pipeline (triggered on End or Pause)

Runs as a background job after session ends:

1. **Save raw transcript** — verbatim turn-by-turn from Realtime API → `transcripts.raw_text`
2. **Chapter auto-tag** — GPT-4o reads transcript, assigns `chapter_id`
3. **Polish** — GPT-4o rewrites transcript as memoir prose → `transcripts.polished_text`
4. **Summarize** — GPT-4o generates compact session summary → `transcripts.session_summary` (injected into future system prompts)

### Heritage docs pipeline (on upload)

- One-time GPT-4o call extracts dense summary from doc
- Stored in `heritage_docs.summary_text`
- Injected into every future session's system prompt

---

## Build Phases

| Phase | Deliverable |
|---|---|
| 1 | Scaffold: Next.js on Vercel, Supabase schema, orb UI (no AI) |
| 2 | Voice works: ephemeral tokens, Realtime API connected, session saved |
| 3 | AI interviewer: system prompt, silence detection, Russian persona |
| 4 | Post-session pipeline: tagging, polish, summarization |
| 5 | Text + media input: text bar, photo/file attach, AI acknowledgement |
| 6 | Family view: auth, transcript viewer, comments, raw + polished export |
| 7 | Heritage docs + PDF export: upload → summary extraction, full book PDF |

App is usable for dad at end of Phase 3. Family access at end of Phase 6.

---

## Open Questions / Future

- Photo handling in final PDF (layout TBD)
- Push notifications to family when new session is complete
- Dad-facing voice to hint which topics haven't been covered yet
