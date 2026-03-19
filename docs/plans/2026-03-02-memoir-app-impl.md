# Memoir App — Implementation Reference

**Goal:** A Russian-language voice-first web app that interviews an elderly man about his life, produces polished memoir prose, and gives the family a read-only archive.

**Production:** https://memoir-app-lemon.vercel.app  
**Repo:** `svtgrig-truest/memoir-app`

---

## Architecture

```
memoir-app/
├── app/
│   ├── page.tsx                          # Voice orb — main interface (no auth)
│   ├── archive/
│   │   ├── page.tsx                      # Chapter list (read view)
│   │   ├── chapter/[id]/page.tsx         # Sessions within a chapter
│   │   └── session/[id]/page.tsx         # Session detail, TitleEditor, exports
│   └── family/
│       ├── page.tsx                      # Family login (password)
│       └── dashboard/
│           ├── page.tsx                  # Family archive dashboard
│           ├── session/[id]/page.tsx     # Session detail + RetryPolishButton
│           └── heritage/page.tsx         # Document upload + Prepare-for-AI
├── app/api/
│   ├── session-token/route.ts            # Ephemeral OpenAI token + system prompt build
│   ├── session-end/route.ts              # Close session, run pipeline (maxDuration 120)
│   ├── session-pause/route.ts            # Mark session paused
│   ├── chapters/route.ts                 # Fetch chapters (exclude free theme)
│   ├── transcript/route.ts               # GET/PATCH transcript text + short_title
│   ├── transcript/reprocess/route.ts     # Retry pipeline for stuck transcript
│   ├── export/route.ts                   # PDF / txt export
│   ├── family-auth/route.ts              # Password auth → cookie
│   └── heritage/
│       ├── route.ts                      # Upload doc to Supabase Storage
│       └── reprocess/route.ts            # Extract text via OpenAI Files API + cache
├── components/
│   ├── VoiceOrb.tsx
│   ├── TranscriptViewer.tsx
│   ├── TitleEditor.tsx
│   ├── HeritageDocCard.tsx
│   ├── RetryPolishButton.tsx
│   └── SessionPhotos.tsx
├── lib/
│   ├── realtime.ts                       # WebRTC, buildSystemPrompt, VAD, barge-in
│   ├── pipeline.ts                       # Prompt builders
│   ├── openai.ts                         # OpenAI client (server-only)
│   └── supabase/
│       ├── client.ts                     # Browser Supabase client
│       └── server.ts                     # supabaseAdmin (service role)
```

---

## Database schema

```sql
-- Chapter topics
create table chapters (
  id uuid primary key default gen_random_uuid(),
  title_ru text not null,
  theme text not null,          -- 'childhood' | 'youth' | 'work' | 'family' | 'travel' | 'events' | 'free'
  display_order int not null
);

-- Voice sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references chapters(id),
  started_at timestamptz default now(),
  ended_at timestamptz,
  status text default 'active'  -- 'active' | 'paused' | 'complete'
);

-- Transcripts
create table transcripts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) unique,
  raw_text text,
  polished_text text,
  session_summary text,
  short_title text,
  polished_at timestamptz,
  created_at timestamptz default now()
);

-- Family heritage documents
create table heritage_docs (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_url text not null,
  mime_type text,
  summary_text text,            -- null until Prepare is clicked
  uploaded_at timestamptz default now()
);

-- Session media (photos)
create table session_media (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  file_url text not null,
  mime_type text,
  created_at timestamptz default now()
);
```

RLS enabled on all tables. All server routes use `supabaseAdmin` (service role).

---

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
FAMILY_PASSWORD
```

---

## Voice session flow

### 1. Session start (`page.tsx` → `session-token`)

```
User taps orb
  → POST /api/session-token { chapter_id?, lastChapterId? }
  → server: create OpenAI realtime session → get ephemeral token
  → server: fetch heritage summary_text values from DB
  → server: fetch recent session_summary values from DB
  → server: build system prompt (buildSystemPrompt)
  → return { client_secret, session_id }
  → client: WebRTC connect to OpenAI with ephemeral token
  → dc.onopen: session.update (instructions, VAD config) + response.create (greeting)
```

### 2. During session (`lib/realtime.ts`)

```
Server VAD: threshold 0.6, silence_duration_ms 1200, create_response: true
Barge-in: isAIResponding flag; response.cancel only when AI is mid-response
Events tracked: conversation.item.input_audio_transcription.completed (user),
                response.audio_transcript.done (assistant)
```

### 3. Session end (`page.tsx` → `session-end`)

```
User taps End
  → connection.disconnect()
  → POST /api/session-end { session_id, messages[] }
  → server: countUserWords < 8 → skip, mark complete
  → server: INSERT transcript { raw_text } immediately
  → server: parallel GPT-4o (polish, summarise, title, tag) wrapped in try/catch
  → server: UPDATE transcript { polished_text, session_summary, short_title }
  → server: UPDATE session { status: 'complete', chapter_id? }
```

If GPT fails: session still marked complete; transcript has `raw_text` only; user sees Retry button.

---

## System prompt structure (`buildSystemPrompt`)

```typescript
interface SystemPromptOptions {
  chapterTitle: string | null;
  heritageSummary: string | null;      // pre-extracted, max 12 000 chars
  sessionSummaries: string[];          // recent past sessions
  lastChapterShortTitle?: string | null;
  lastChapterSummary?: string | null;
}
```

Sections injected in order:
1. Role + language + tone
2. Address rules (вы, Александр Григорьевич, no epithets)
3. Strict one-question rule + silence rule + bridge rule
4. Chapter goal
5. Heritage knowledge base + directive: "you already know these facts — reference them specifically"
6. Previous sessions + directive: "do not repeat these topics"
7. Greeting instruction (context-aware: first session vs. continuation)

---

## Pipeline prompts (`lib/pipeline.ts`)

### Polish
Converts raw interviewer/subject dialogue to first-person memoir prose. Forbidden: add details not mentioned; change facts; rewrite in interviewer's voice.

### Summary
2–3 sentence past-tense summary of what was discussed. Used in future system prompts to avoid repetition.

### Title
`buildTitlePrompt(rawText, existingTitles[])` — returns a 3–6 word title.
Rules: specific (person/place/event, not theme), first word only capitalised, no quotes, no epithets, not thematically similar to any entry in `existingTitles`.

### Tag
Returns the name of the most relevant chapter from a provided list, or empty string if none match.

---

## Heritage document extraction (`/api/heritage/reprocess`)

```
POST { id: docId }
  → fetch doc record (filename, file_url, mime_type) from DB
  → download file buffer from Supabase Storage via admin client
  → openai.files.create({ file: toFile(buffer, filename, mimeType), purpose: 'assistants' })
  → openai.responses.create with input_file (file_id) + extraction prompt
  → delete file from OpenAI after extraction
  → UPDATE heritage_docs SET summary_text = extractedText
```

Extraction prompt is framed as "составь биографический указатель" (make a biographical index) — factual list framing avoids copyright refusal.

---

## Key TypeScript gotchas

```typescript
// ✅ Correct
await openai.files.delete(fileId);

// ❌ Wrong (v4 API, removed in v6)
await openai.files.del(fileId);

// ✅ Correct — Supabase is PromiseLike, not Promise
supabaseAdmin.from('t').update({}).eq('id', id).then(() => {}, () => {});

// ❌ Wrong — .catch() does not exist on Supabase builders
supabaseAdmin.from('t').update({}).eq('id', id).catch(() => {});

// ✅ No middleware.ts — breaks Turbopack in Next.js 16
// Delete the file if it exists
```

---

## Deployment

Push to `main` → Vercel auto-deploys. Changes are made via the GitHub API from the Replit environment.

```bash
# Verify build locally (if needed)
npm run build

# Check production logs
# → use Vercel dashboard or fetch-deployment-logs
```

---

## Manual test checklist

- [ ] Orb page loads without login
- [ ] Tap orb → microphone permission → AI greets in Russian
- [ ] AI asks one question and waits silently
- [ ] User speaks → AI responds with a connected follow-up question
- [ ] Speaking while AI talks → AI stops (barge-in)
- [ ] Heritage docs marked "Готов для AI" → AI references specific facts from them
- [ ] End session → transcript appears in archive
- [ ] Session with < 8 user words → not visible in archive
- [ ] Family login with wrong password → error
- [ ] Family login with correct password → dashboard
- [ ] Session with pipeline failure → Retry button appears → click → polished text generated
- [ ] Inline title edit works
- [ ] PDF / txt export works
- [ ] Heritage: upload doc → click Prepare → "Готов для AI" → next session uses it

---

## Deferred / known limitations

- PDF export uses jsPDF with Latin fonts; Cyrillic may not render correctly → consider Puppeteer
- Comments feature: DB schema ready, UI not built
- Full-book PDF (all chapters combined): deferred to post-MVP
