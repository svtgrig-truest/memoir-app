# Memoir — voice-first memoir assistant

An app for recording family history through AI-powered interviews. The subject (Alexander Grigoryevich) speaks with an AI interviewer in Russian; the system transcribes each session, polishes the raw dialogue into memoir prose, and stores it in a family archive.

**Production:** https://memoir-app-lemon.vercel.app

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), React 19 |
| Styles | Tailwind CSS v4, Framer Motion |
| Voice | OpenAI Realtime API (WebRTC) |
| AI pipeline | GPT-4o (polish, summaries, titles); GPT-4o-mini (heritage doc extraction) |
| Database | Supabase (PostgreSQL + RLS + Storage) |
| Auth | Supabase Auth (family password access) |
| Deploy | Vercel (auto-deploy from `main`) |
| PDF export | jsPDF |

---

## Project structure

```
memoir-app/
├── app/
│   ├── page.tsx                        # Main — voice orb interface
│   ├── archive/
│   │   ├── page.tsx                    # Chapter list
│   │   ├── chapter/[id]/page.tsx       # Sessions within a chapter
│   │   └── session/[id]/page.tsx       # Session detail + TitleEditor
│   └── family/
│       ├── page.tsx                    # Family login form
│       └── dashboard/
│           ├── page.tsx                # Family archive (read-only)
│           ├── session/[id]/page.tsx   # Session detail with retry button
│           └── heritage/page.tsx       # Family documents (PDF/DOCX/TXT upload)
│
├── app/api/
│   ├── session-token/route.ts          # Ephemeral token; reads cached heritage summaries
│   ├── session-end/route.ts            # Close session + pipeline (polish/summary/title)
│   ├── session-pause/route.ts          # Pause session
│   ├── chapters/route.ts               # GET chapters (no free theme), lastChapterId
│   ├── transcript/route.ts             # GET/PATCH transcript text + short_title
│   ├── transcript/reprocess/route.ts   # POST: retry pipeline for a stuck transcript
│   ├── export/route.ts                 # GET: PDF chapter export
│   ├── family-auth/route.ts            # POST: family password → cookie
│   └── heritage/
│       ├── route.ts                    # POST: upload file to Supabase Storage
│       └── reprocess/route.ts          # POST: extract text from document via Files API
│
├── components/
│   ├── TitleEditor.tsx                 # Inline session title editor
│   ├── HeritageDocCard.tsx             # Document card: filename, AI-ready status, process button
│   ├── RetryPolishButton.tsx           # Retry pipeline for sessions with missing polished text
│   └── TranscriptViewer.tsx            # Raw / polished text viewer with inline edit
│
├── lib/
│   ├── realtime.ts                     # WebRTC, buildSystemPrompt, VAD config, barge-in
│   ├── pipeline.ts                     # buildPolishPrompt / buildSummaryPrompt / buildTitlePrompt
│   └── supabase/server.ts              # supabaseAdmin (service role, server-only)
```

---

## Key mechanics

### Voice session
- User selects a chapter topic → taps the orb → WebRTC connects to OpenAI Realtime API
- VAD: threshold 0.6, silence 1200 ms; server auto-creates a response when user stops speaking (`create_response: true`)
- AI only cancels its current response if the user starts speaking while the AI is actively responding (barge-in guard via `isAIResponding` flag)
- `?autostart=1` triggers the session without tapping; removed from URL via `replaceState` immediately

### Transcript pipeline
After session end (`/api/session-end`):
1. Count user words — if < 8, no transcript is created and session is silently marked complete
2. Save raw transcript immediately (data is never lost even if GPT calls fail)
3. In parallel: polish prose, summarise, generate title, tag to chapter
4. Title generation is aware of existing titles (no repeated themes)
5. Pipeline wrapped in try/catch — if GPT fails, session still closes and raw text is preserved

### Heritage documents
- Family uploads PDF, DOCX, or TXT → file saved to Supabase Storage, `summary_text = null`
- On the heritage page, each document shows its AI-readiness status
- Click **Prepare** → file is downloaded from Supabase, uploaded to OpenAI Files API, text extracted, result cached in `heritage_docs.summary_text`
- Session start reads only the cached `summary_text` (fast, no extraction at session time)

### Archive
- Chapters: Childhood, Youth, Work & career, Family, Travel, Important events
- "We left off here" badge on the last session in a chapter
- Inline session title editing via `TitleEditor`
- Sessions with no transcript are hidden from all listings

---

## Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
FAMILY_PASSWORD=
```

---

## Database (Supabase)

| Table | Purpose |
|---|---|
| `chapters` | Conversation topics (display_order, theme, title_ru) |
| `sessions` | Voice sessions (chapter_id, started_at, ended_at, status) |
| `transcripts` | Polished text, session_summary, short_title, raw_text |
| `heritage_docs` | Family documents (filename, file_url, mime_type, summary_text) |

RLS enabled on all tables. All API routes use `supabaseAdmin` (service role key).

---

## Design tokens

```css
--bg: #0d0b09
--bg-card: #1c1914
--accent: #d4a853
--text: #f0ece4
--text-muted: #7a6f62
--border: #2a2118
```

---

## Development & deployment

Push to `main` → Vercel rebuilds automatically. File changes are made via GitHub API from the Replit environment. Repo: `svtgrig-truest/memoir-app`.
