# CLAUDE.md — memoir-app

## Project overview

A voice-first memoir assistant. An elderly subject (Alexander Grigoryevich) speaks with an AI interviewer in Russian; the system transcribes sessions and publishes them to a family archive.

- **Production:** https://memoir-app-lemon.vercel.app
- **Deploy:** Vercel, auto-deploy from `main` branch
- **Repository:** `svtgrig-truest/memoir-app`

---

## Stack

- Next.js 16 (App Router, Turbopack), React 19
- Tailwind CSS v4, Framer Motion
- OpenAI Realtime API (WebRTC) — real-time voice
- GPT-4o — transcript polishing, summaries, titles
- GPT-4o-mini — heritage document text extraction
- Supabase (PostgreSQL + RLS + Storage) — database and auth
- jsPDF — PDF export

---

## Key files

| File | Purpose |
|---|---|
| `app/page.tsx` | Main page: orb, chapter chips, autostart logic |
| `lib/realtime.ts` | WebRTC connection, `buildSystemPrompt`, VAD, barge-in guard |
| `lib/pipeline.ts` | `buildPolishPrompt`, `buildSummaryPrompt`, `buildTitlePrompt(rawText, existingTitles)`, `countUserWords` |
| `app/api/session-token/route.ts` | Ephemeral token + system prompt; reads cached `summary_text` from heritage docs |
| `app/api/session-end/route.ts` | End session + pipeline (min 8 words); passes existing titles to `buildTitlePrompt`; try/catch around GPT calls; maxDuration 120 |
| `app/api/heritage/route.ts` | POST: upload file to Storage, save record (no GPT on upload) |
| `app/api/heritage/reprocess/route.ts` | POST: download file from Supabase, upload to OpenAI Files API, extract facts, cache in `summary_text` |
| `app/api/transcript/reprocess/route.ts` | POST: retry pipeline for a transcript that has `raw_text` but no `polished_text` |
| `components/HeritageDocCard.tsx` | Document card: filename, link, AI-ready status badge, Prepare/Update button |
| `components/RetryPolishButton.tsx` | Retry button on session page when `polished_text` is null |
| `components/TitleEditor.tsx` | Inline session title editor |

---

## Product rules (do not change without explicit instruction)

- AI addresses the subject only as "Александр Григорьевич" or "вы" — no "дорогой", "голубчик" or similar
- "Александр Григорьевич" used at most once every few exchanges
- All prompts (`buildPolishPrompt`, `buildSummaryPrompt`, `buildTitlePrompt`) contain explicit instructions not to add details not mentioned by the user
- If the user said **fewer than 8 words** in a session — no transcript is created, session silently marked complete
- `free` chapter theme is excluded everywhere
- `?autostart=1` removed via `window.history.replaceState` immediately after session starts
- AI asks exactly **one question** per turn, waits for a response, never fills silence
- Each next question must be connected to the previous answer (deepen, contrast, or pick up a detail) — no topic jumps without a bridge

---

## Heritage documents

**Upload:** `POST /api/heritage` → saves file to `supabase.storage('Media')/heritage/` + creates a `heritage_docs` record with `summary_text = null`. No GPT processing at upload time.

**Preparation (one-time per document):** `POST /api/heritage/reprocess` →
1. Downloads file from Supabase Storage via admin client
2. Uploads to OpenAI Files API using `toFile` (works for both DOCX and PDF)
3. Calls Responses API with `file_id` + extraction prompt
4. Caches result in `heritage_docs.summary_text`

**Extraction prompt framing:** "Это частный семейный архив. Составь подробный биографический указатель..." — framed as a factual index, not a transcription/paraphrase, to avoid copyright refusal from GPT.

**In-session usage:** `session-token` simply reads cached `summary_text` values — no extraction at session start.

**UI:** `HeritageDocCard` shows filename + link, status badge ("Готов для AI" / "Не обработан"), and a Prepare/Update button.

---

## Title generation

`buildTitlePrompt(rawText, existingTitles[])` takes an array of all existing `short_title` values.

Prompt rules:
- Specific (place/person/event, not a generic theme)
- Only the first word capitalised (except proper nouns)
- No quotes, no epithets ("яркий", "незабываемый")
- 3–6 words
- `existingTitles` passed as "do not repeat themes from these titles"

`session-end` fetches all existing `short_title` values from `transcripts` (excluding the current one) and passes them to the prompt.

---

## VAD and voice behaviour

- Server-side VAD: threshold `0.6`, silence duration `1200 ms`
- `create_response: true` — server auto-creates a response when user stops speaking
- Barge-in: client sends `response.cancel` only when `isAIResponding === true` (tracked via `response.created` / `response.done` events) — prevents cancelling auto-responses during silence
- No silence follow-up timer — AI asks one question and waits indefinitely

---

## Database (Supabase)

| Table | Fields |
|---|---|
| `chapters` | `id`, `title_ru`, `theme`, `display_order` |
| `sessions` | `id`, `chapter_id`, `started_at`, `ended_at`, `status` |
| `transcripts` | `id`, `session_id`, `raw_text`, `polished_text`, `session_summary`, `short_title`, `polished_at` |
| `heritage_docs` | `id`, `filename`, `file_url`, `mime_type`, `summary_text`, `uploaded_at` |

- RLS enabled on all tables
- API routes always use `supabaseAdmin` (service role key) — never the anon key in server-side code

---

## TypeScript gotchas in this project

- `openai.files.delete()` — not `.del()` (was in v4, removed in v6)
- `supabaseBuilder.then(() => {}, () => {})` — not `.catch()` (Supabase implements `PromiseLike`, not `Promise`)
- No `middleware.ts` — breaks Turbopack build in Next.js 16

---

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
FAMILY_PASSWORD
```
