# Memoir App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Russian-language voice-first web app that interviews an elderly man about his life and produces a family memoir.

**Architecture:** Next.js 15 (App Router) on Vercel. Supabase for auth, database, and file storage. OpenAI Realtime API (WebRTC, ephemeral tokens) for live voice conversation. GPT-4o for post-session transcript polishing, chapter tagging, and summarization.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Framer Motion, Supabase JS v2, OpenAI Node SDK, jsPDF, Vitest + React Testing Library

---

## Project Structure

```
memoir-app/
├── app/
│   ├── page.tsx                        # Dad's voice interface (no auth)
│   ├── family/
│   │   ├── page.tsx                    # Family login
│   │   └── dashboard/
│   │       ├── page.tsx                # Chapter/session browser
│   │       └── session/[id]/page.tsx   # Transcript viewer + comments
│   └── api/
│       ├── session-token/route.ts      # OpenAI ephemeral token
│       ├── session-end/route.ts        # Trigger post-session pipeline
│       └── heritage/route.ts           # Heritage doc upload + summarize
├── components/
│   ├── VoiceOrb.tsx
│   ├── ChapterSidebar.tsx
│   ├── TextInputBar.tsx
│   ├── TranscriptViewer.tsx
│   └── CommentThread.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # Browser Supabase client
│   │   └── server.ts                   # Server Supabase client
│   ├── openai.ts                       # OpenAI client (server-only)
│   ├── realtime.ts                     # WebRTC helpers (browser)
│   └── pipeline.ts                     # Post-session GPT-4o calls
├── types/index.ts
├── supabase/migrations/001_initial.sql
└── .env.local.example
```

---

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
FAMILY_PASSWORD=                        # single shared password for /family
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `memoir-app/` (entire project)
- Create: `supabase/migrations/001_initial.sql`
- Create: `types/index.ts`
- Create: `.env.local.example`

**Step 1: Bootstrap Next.js project**

```bash
npx create-next-app@latest memoir-app \
  --typescript --tailwind --eslint --app --src-dir=no \
  --import-alias "@/*"
cd memoir-app
```

**Step 2: Install dependencies**

```bash
npm install \
  @supabase/supabase-js \
  openai \
  framer-motion \
  jspdf \
  @radix-ui/react-dialog \
  @radix-ui/react-scroll-area

npm install -D \
  vitest \
  @vitejs/plugin-react \
  @testing-library/react \
  @testing-library/jest-dom \
  jsdom
```

**Step 3: Write Supabase migration**

Create `supabase/migrations/001_initial.sql`:

```sql
-- Users (family only; dad has no account)
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  role text not null default 'family' check (role in ('admin', 'family')),
  created_at timestamptz default now()
);

-- Chapters
create table chapters (
  id uuid primary key default gen_random_uuid(),
  title_ru text not null,
  display_order int not null,
  theme text not null check (theme in (
    'childhood','youth','career','family','travel','events','free','custom'
  )),
  created_at timestamptz default now()
);

-- Seed default chapters
insert into chapters (title_ru, display_order, theme) values
  ('Детство', 1, 'childhood'),
  ('Юность', 2, 'youth'),
  ('Работа и карьера', 3, 'career'),
  ('Семья', 4, 'family'),
  ('Путешествия', 5, 'travel'),
  ('Важные события', 6, 'events'),
  ('Свободный рассказ', 7, 'free');

-- Sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references chapters(id),
  status text not null default 'active' check (status in ('active','paused','complete')),
  started_at timestamptz default now(),
  ended_at timestamptz
);

-- Messages (turn-by-turn conversation)
create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content_type text not null default 'text' check (content_type in ('text','audio_transcript','image','file')),
  content_text text,
  file_url text,
  created_at timestamptz default now()
);

-- Transcripts
create table transcripts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  raw_text text,
  polished_text text,
  session_summary text,
  polished_at timestamptz,
  created_at timestamptz default now()
);

-- Comments
create table comments (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references transcripts(id) on delete cascade,
  user_id uuid references users(id),
  anchor_text text,
  body text not null,
  created_at timestamptz default now()
);

-- Heritage docs
create table heritage_docs (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_url text not null,
  mime_type text,
  summary_text text,
  uploaded_at timestamptz default now()
);

-- RLS: disable for now (personal app, single user)
alter table sessions disable row level security;
alter table messages disable row level security;
alter table transcripts disable row level security;
alter table comments disable row level security;
alter table heritage_docs disable row level security;
alter table chapters disable row level security;
```

**Step 4: Write TypeScript types**

Create `types/index.ts`:

```typescript
export type ChapterTheme =
  | 'childhood' | 'youth' | 'career' | 'family'
  | 'travel' | 'events' | 'free' | 'custom';

export type SessionStatus = 'active' | 'paused' | 'complete';

export interface Chapter {
  id: string;
  title_ru: string;
  display_order: number;
  theme: ChapterTheme;
}

export interface Session {
  id: string;
  chapter_id: string | null;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
}

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content_type: 'text' | 'audio_transcript' | 'image' | 'file';
  content_text: string | null;
  file_url: string | null;
  created_at: string;
}

export interface Transcript {
  id: string;
  session_id: string;
  raw_text: string | null;
  polished_text: string | null;
  session_summary: string | null;
  polished_at: string | null;
}

export interface Comment {
  id: string;
  transcript_id: string;
  anchor_text: string | null;
  body: string;
  created_at: string;
}

export interface HeritageDoc {
  id: string;
  filename: string;
  file_url: string;
  summary_text: string | null;
}

export type OrbState = 'idle' | 'listening' | 'speaking' | 'thinking';
```

**Step 5: Set up Supabase clients**

Create `lib/supabase/client.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

Create `lib/supabase/server.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

**Step 6: Set up Vitest**

Add to `package.json` scripts:
```json
"test": "vitest",
"test:ui": "vitest --ui"
```

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
```

Create `tests/setup.ts`:
```typescript
import '@testing-library/jest-dom';
```

**Step 7: Create Supabase project and run migration**

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Login and link project (follow prompts)
supabase login
supabase init
supabase db push  # or run migration SQL in Supabase dashboard
```

**Step 8: Create .env.local from example, fill in values**

```bash
cp .env.local.example .env.local
# Fill in values from Supabase dashboard and OpenAI dashboard
```

**Step 9: Verify dev server starts**

```bash
npm run dev
# Expected: Next.js running at http://localhost:3000
```

**Step 10: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Next.js project with Supabase schema and types"
```

---

## Task 2: Animated Orb UI (Dad's Interface — Static)

**Files:**
- Create: `components/VoiceOrb.tsx`
- Create: `components/ChapterSidebar.tsx`
- Create: `components/TextInputBar.tsx`
- Modify: `app/page.tsx`
- Create: `tests/components/VoiceOrb.test.tsx`

**Step 1: Write failing test for VoiceOrb**

Create `tests/components/VoiceOrb.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { VoiceOrb } from '@/components/VoiceOrb';

describe('VoiceOrb', () => {
  it('renders with idle state', () => {
    render(<VoiceOrb state="idle" onClick={jest.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('calls onClick when tapped', async () => {
    const onClick = jest.fn();
    render(<VoiceOrb state="idle" onClick={onClick} />);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- VoiceOrb
# Expected: FAIL — module not found
```

**Step 3: Implement VoiceOrb**

Create `components/VoiceOrb.tsx`:

```typescript
'use client';
import { motion } from 'framer-motion';
import { OrbState } from '@/types';

interface Props {
  state: OrbState;
  onClick: () => void;
}

const orbVariants = {
  idle: {
    scale: [1, 1.03, 1],
    opacity: [0.7, 0.85, 0.7],
    transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    scale: [1, 1.12, 0.97, 1.08, 1],
    opacity: [0.8, 1, 0.9, 1, 0.8],
    transition: { duration: 0.8, repeat: Infinity },
  },
  speaking: {
    scale: [1, 1.06, 1.02, 1.08, 1],
    opacity: [0.9, 1, 0.95, 1, 0.9],
    transition: { duration: 0.5, repeat: Infinity },
  },
  thinking: {
    rotate: [0, 360],
    transition: { duration: 2, repeat: Infinity, ease: 'linear' },
  },
};

export function VoiceOrb({ state, onClick }: Props) {
  return (
    <button
      role="button"
      onClick={onClick}
      className="relative flex items-center justify-center w-48 h-48 rounded-full focus:outline-none"
      aria-label="Начать разговор"
    >
      {/* Outer glow ring */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 opacity-20"
        animate={state === 'idle' ? orbVariants.idle : undefined}
      />
      {/* Core orb */}
      <motion.div
        className="w-36 h-36 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-2xl shadow-blue-500/50"
        animate={orbVariants[state]}
      />
    </button>
  );
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- VoiceOrb
# Expected: PASS
```

**Step 5: Implement ChapterSidebar**

Create `components/ChapterSidebar.tsx`:

```typescript
'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Chapter } from '@/types';
import { X, Plus } from 'lucide-react';

interface Props {
  chapters: Chapter[];
  completedIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function ChapterSidebar({ chapters, completedIds, selectedId, onSelect }: Props) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="absolute top-4 left-4 p-3 text-white/70 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-0 top-0 h-full w-72 bg-zinc-900 text-white p-6 flex flex-col shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <Dialog.Title className="text-lg font-semibold">Мои воспоминания</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
            </Dialog.Close>
          </div>

          <nav className="flex-1 space-y-1">
            <Dialog.Close asChild>
              <button
                onClick={() => onSelect(null)}
                className={`w-full text-left px-4 py-3 rounded-xl text-base transition-colors ${
                  selectedId === null ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                Свободный разговор
              </button>
            </Dialog.Close>
            {chapters.map((ch) => (
              <Dialog.Close asChild key={ch.id}>
                <button
                  onClick={() => onSelect(ch.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-base flex items-center justify-between transition-colors ${
                    selectedId === ch.id ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>{ch.title_ru}</span>
                  {completedIds.has(ch.id) && (
                    <span className="text-blue-400 text-xs">✓</span>
                  )}
                </button>
              </Dialog.Close>
            ))}
          </nav>

          <button className="mt-6 flex items-center gap-2 text-white/40 hover:text-white/70 text-sm">
            <Plus className="w-4 h-4" /> Новая тема
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

**Step 6: Implement TextInputBar**

Create `components/TextInputBar.tsx`:

```typescript
'use client';
import { useState, useRef } from 'react';
import { Paperclip, Mic, MicOff, Send } from 'lucide-react';

interface Props {
  onSendText: (text: string) => void;
  onAttach: (files: FileList) => void;
  isMicActive: boolean;
  onToggleMic: () => void;
  disabled?: boolean;
}

export function TextInputBar({ onSendText, onAttach, isMicActive, onToggleMic, disabled }: Props) {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendText(text.trim());
    setText('');
  };

  return (
    <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-2xl px-4 py-3 border border-white/10">
      <input
        type="file"
        ref={fileRef}
        className="hidden"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt"
        onChange={(e) => e.target.files && onAttach(e.target.files)}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="text-white/50 hover:text-white transition-colors"
        disabled={disabled}
      >
        <Paperclip className="w-5 h-5" />
      </button>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        placeholder="Напишите..."
        className="flex-1 bg-transparent text-white placeholder-white/30 outline-none text-base"
        disabled={disabled}
      />
      {text.trim() ? (
        <button onClick={handleSend} className="text-blue-400 hover:text-blue-300">
          <Send className="w-5 h-5" />
        </button>
      ) : (
        <button
          onClick={onToggleMic}
          className={isMicActive ? 'text-blue-400' : 'text-white/50 hover:text-white'}
        >
          {isMicActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
      )}
    </div>
  );
}
```

**Step 7: Build the main page (static, no AI yet)**

Replace `app/page.tsx`:

```typescript
'use client';
import { useState, useEffect } from 'react';
import { VoiceOrb } from '@/components/VoiceOrb';
import { ChapterSidebar } from '@/components/ChapterSidebar';
import { TextInputBar } from '@/components/TextInputBar';
import { supabase } from '@/lib/supabase/client';
import { Chapter, OrbState } from '@/types';
import { Pause, X } from 'lucide-react';

export default function Home() {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);

  useEffect(() => {
    supabase.from('chapters').select('*').order('display_order')
      .then(({ data }) => data && setChapters(data));
  }, []);

  const handleOrbClick = () => {
    if (!isSessionActive) {
      setIsSessionActive(true);
      setOrbState('listening');
      // TODO Task 4: connect to OpenAI Realtime API
    }
  };

  const handlePause = () => {
    setOrbState('idle');
    setIsSessionActive(false);
    // TODO Task 4: pause session
  };

  const handleEnd = () => {
    setOrbState('idle');
    setIsSessionActive(false);
    // TODO Task 4: end session + trigger pipeline
  };

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-between relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-radial from-indigo-950/50 via-zinc-950 to-zinc-950 pointer-events-none" />

      {/* Header controls */}
      <div className="relative w-full flex justify-between items-start p-4">
        <ChapterSidebar
          chapters={chapters}
          completedIds={new Set()}
          selectedId={selectedChapterId}
          onSelect={setSelectedChapterId}
        />
        {selectedChapterId && (
          <div className="text-white/50 text-sm mt-1 ml-16">
            {chapters.find(c => c.id === selectedChapterId)?.title_ru}
          </div>
        )}
      </div>

      {/* Orb + session controls */}
      <div className="relative flex flex-col items-center gap-12">
        <VoiceOrb state={orbState} onClick={handleOrbClick} />

        {isSessionActive && (
          <div className="flex gap-8">
            <button
              onClick={handlePause}
              className="flex flex-col items-center gap-2 text-white/60 hover:text-white transition-colors"
            >
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                <Pause className="w-6 h-6" />
              </div>
              <span className="text-xs">Пауза</span>
            </button>
            <button
              onClick={handleEnd}
              className="flex flex-col items-center gap-2 text-white/60 hover:text-white transition-colors"
            >
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                <X className="w-6 h-6" />
              </div>
              <span className="text-xs">Завершить</span>
            </button>
          </div>
        )}
      </div>

      {/* Text input bar */}
      <div className="relative w-full max-w-lg px-4 pb-8">
        <TextInputBar
          onSendText={(t) => console.log('text:', t)}  // TODO Task 8
          onAttach={(f) => console.log('files:', f)}   // TODO Task 8
          isMicActive={isSessionActive}
          onToggleMic={handleOrbClick}
          disabled={false}
        />
      </div>
    </main>
  );
}
```

**Step 8: Verify UI renders correctly on mobile**

```bash
npm run dev
# Open http://localhost:3000 in browser
# Check mobile view in DevTools (375px width)
# Verify: orb visible, hamburger opens sidebar, text bar at bottom
```

**Step 9: Commit**

```bash
git add .
git commit -m "feat: dad's voice interface — animated orb, chapter sidebar, text input bar"
```

---

## Task 3: Ephemeral Token API + Session Creation

**Files:**
- Create: `lib/openai.ts`
- Create: `app/api/session-token/route.ts`
- Create: `tests/api/session-token.test.ts`

**Step 1: Write failing test**

Create `tests/api/session-token.test.ts`:

```typescript
import { POST } from '@/app/api/session-token/route';
import { NextRequest } from 'next/server';

// Mock OpenAI
jest.mock('@/lib/openai', () => ({
  openai: {
    beta: { realtime: { sessions: { create: jest.fn().mockResolvedValue({
      client_secret: { value: 'test-ephemeral-token' }
    })}}}
  }
}));

// Mock Supabase
jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: () => ({ select: () => ({ single: () => ({
        data: { id: 'session-123' }, error: null
      })})})
    })
  }
}));

describe('POST /api/session-token', () => {
  it('returns ephemeral token and session id', async () => {
    const req = new NextRequest('http://localhost/api/session-token', { method: 'POST' });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.client_secret.value).toBe('test-ephemeral-token');
    expect(body.session_id).toBe('session-123');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- session-token
# Expected: FAIL — module not found
```

**Step 3: Implement OpenAI client**

Create `lib/openai.ts`:

```typescript
import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});
```

**Step 4: Implement session-token route**

Create `app/api/session-token/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const chapterId: string | null = body.chapter_id ?? null;

  // Create session in DB
  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .insert({ chapter_id: chapterId, status: 'active' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get ephemeral token from OpenAI
  const realtimeSession = await openai.beta.realtime.sessions.create({
    model: 'gpt-4o-realtime-preview',
    voice: 'shimmer',
  });

  return NextResponse.json({
    client_secret: realtimeSession.client_secret,
    session_id: session.id,
  });
}
```

**Step 5: Run test to verify it passes**

```bash
npm test -- session-token
# Expected: PASS
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: ephemeral token API endpoint with session creation"
```

---

## Task 4: WebRTC Voice Connection

**Files:**
- Create: `lib/realtime.ts`
- Modify: `app/page.tsx`
- Create: `tests/lib/realtime.test.ts`

**Step 1: Write failing test**

Create `tests/lib/realtime.test.ts`:

```typescript
import { buildSystemPrompt } from '@/lib/realtime';

describe('buildSystemPrompt', () => {
  it('includes chapter context when provided', () => {
    const prompt = buildSystemPrompt({ chapterTitle: 'Детство', heritageSummary: null, sessionSummaries: [] });
    expect(prompt).toContain('Детство');
  });

  it('includes heritage summary when provided', () => {
    const prompt = buildSystemPrompt({ chapterTitle: null, heritageSummary: 'Семья из Одессы', sessionSummaries: [] });
    expect(prompt).toContain('Семья из Одессы');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- realtime
# Expected: FAIL
```

**Step 3: Implement realtime helpers**

Create `lib/realtime.ts`:

```typescript
export interface SystemPromptOptions {
  chapterTitle: string | null;
  heritageSummary: string | null;
  sessionSummaries: string[];
}

export function buildSystemPrompt(opts: SystemPromptOptions): string {
  const { chapterTitle, heritageSummary, sessionSummaries } = opts;

  const chapterContext = chapterTitle
    ? `Цель текущей беседы: исследуй тему — «${chapterTitle}».`
    : 'Цель текущей беседы: следуй за тем, что хочет рассказать собеседник.';

  const heritageSection = heritageSummary
    ? `\n\nКонтекст семьи:\n${heritageSummary}`
    : '';

  const summarySection = sessionSummaries.length
    ? `\n\nПредыдущие беседы:\n${sessionSummaries.join('\n')}`
    : '';

  return `Ты тёплый, любопытный, эмпатичный интервьюер, помогающий пожилому человеку записать историю его жизни. Говори только по-русски. Будь терпелив, внимателен и никогда не торопи собеседника.

Правила:
- Задавай только один вопрос за раз
- Активное слушание: отражай сказанное перед следующим вопросом
- Если тишина более 8 секунд, мягко спроси: «Расскажи подробнее...» или «Что ты помнишь об этом времени?»
- Если упоминается имя, место или событие — копай глубже
- Никогда не поправляй и не перебивай
- После примерно 40 минут мягко предложи завершить беседу

${chapterContext}${heritageSection}${summarySection}`;
}

export interface RealtimeConnection {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  stream: MediaStream;
  audioEl: HTMLAudioElement;
  disconnect: () => void;
}

export async function connectToRealtime(
  ephemeralToken: string,
  systemPrompt: string,
  onEvent: (event: Record<string, unknown>) => void
): Promise<RealtimeConnection> {
  const pc = new RTCPeerConnection();

  // Audio output
  const audioEl = document.createElement('audio');
  audioEl.autoplay = true;
  pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };

  // Microphone input
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(stream.getTracks()[0]);

  // Data channel for events
  const dc = pc.createDataChannel('oai-events');
  dc.onopen = () => {
    // Send session update with system prompt
    dc.send(JSON.stringify({
      type: 'session.update',
      session: {
        instructions: systemPrompt,
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          silence_duration_ms: 800,
          threshold: 0.5,
        },
      },
    }));
  };
  dc.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch {}
  };

  // SDP handshake
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const response = await fetch(
    'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ephemeralToken}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    }
  );

  const answerSdp = await response.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

  return {
    pc, dc, stream, audioEl,
    disconnect: () => {
      stream.getTracks().forEach(t => t.stop());
      pc.close();
      audioEl.remove();
    },
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- realtime
# Expected: PASS (buildSystemPrompt tests)
```

**Step 5: Wire voice connection into page**

Update `app/page.tsx` — replace the `handleOrbClick`, `handlePause`, `handleEnd`, and add state:

```typescript
// Add to imports
import { connectToRealtime, buildSystemPrompt, RealtimeConnection } from '@/lib/realtime';
import { supabase } from '@/lib/supabase/client';

// Add state
const [sessionId, setSessionId] = useState<string | null>(null);
const [connection, setConnection] = useState<RealtimeConnection | null>(null);
const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);

const handleOrbClick = async () => {
  if (isSessionActive) return;
  setOrbState('thinking');

  // Fetch heritage summaries
  const { data: docs } = await supabase.from('heritage_docs').select('summary_text');
  const heritageSummary = docs?.map(d => d.summary_text).filter(Boolean).join('\n') ?? null;

  // Fetch recent session summaries
  const { data: transcripts } = await supabase
    .from('transcripts')
    .select('session_summary')
    .not('session_summary', 'is', null)
    .order('created_at', { ascending: false })
    .limit(3);
  const sessionSummaries = transcripts?.map(t => t.session_summary!).filter(Boolean) ?? [];

  const chapterTitle = chapters.find(c => c.id === selectedChapterId)?.title_ru ?? null;
  const systemPrompt = buildSystemPrompt({ chapterTitle, heritageSummary, sessionSummaries });

  // Get ephemeral token + create session
  const tokenRes = await fetch('/api/session-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapter_id: selectedChapterId }),
  });
  const { client_secret, session_id } = await tokenRes.json();
  setSessionId(session_id);

  // Connect WebRTC
  const conn = await connectToRealtime(client_secret.value, systemPrompt, (event) => {
    // Track orb state from OpenAI events
    if (event.type === 'input_audio_buffer.speech_started') setOrbState('listening');
    if (event.type === 'response.audio.started') setOrbState('speaking');
    if (event.type === 'response.audio.done') setOrbState('listening');

    // Capture transcript turns
    if (event.type === 'conversation.item.created') {
      const item = event.item as Record<string, unknown>;
      if (item.role === 'user' || item.role === 'assistant') {
        const content = (item.content as Array<Record<string, unknown>>)?.[0];
        const text = (content?.transcript ?? content?.text ?? '') as string;
        if (text) setMessages(prev => [...prev, { role: item.role as string, text }]);
      }
    }
  });

  setConnection(conn);
  setIsSessionActive(true);
  setOrbState('listening');
};

const handlePause = async () => {
  connection?.disconnect();
  setConnection(null);
  setOrbState('idle');
  setIsSessionActive(false);
  if (sessionId) {
    await supabase.from('sessions').update({ status: 'paused' }).eq('id', sessionId);
  }
};

const handleEnd = async () => {
  connection?.disconnect();
  setConnection(null);
  setOrbState('idle');
  setIsSessionActive(false);

  if (sessionId && messages.length > 0) {
    // Trigger post-session pipeline
    await fetch('/api/session-end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, messages }),
    });
  }
  setSessionId(null);
  setMessages([]);
};
```

**Step 6: Manual test**

```bash
npm run dev
# Open http://localhost:3000
# Tap orb → grant microphone → speak in Russian
# Verify: AI responds in Russian, orb animates correctly
# Tap End → no errors
```

**Step 7: Commit**

```bash
git add .
git commit -m "feat: WebRTC voice connection to OpenAI Realtime API with transcript capture"
```

---

## Task 5: Post-Session Pipeline

**Files:**
- Create: `lib/pipeline.ts`
- Create: `app/api/session-end/route.ts`
- Create: `tests/lib/pipeline.test.ts`

**Step 1: Write failing tests**

Create `tests/lib/pipeline.test.ts`:

```typescript
import { buildRawTranscript, buildPolishPrompt, buildTagPrompt } from '@/lib/pipeline';

describe('buildRawTranscript', () => {
  it('formats messages as dialogue', () => {
    const messages = [
      { role: 'assistant', text: 'Расскажи о детстве.' },
      { role: 'user', text: 'Я родился в Москве.' },
    ];
    const result = buildRawTranscript(messages);
    expect(result).toContain('Интервьюер: Расскажи о детстве.');
    expect(result).toContain('Папа: Я родился в Москве.');
  });
});

describe('buildPolishPrompt', () => {
  it('returns a prompt containing the raw transcript', () => {
    const prompt = buildPolishPrompt('Папа: Я родился в Москве.');
    expect(prompt).toContain('Папа: Я родился в Москве.');
  });
});

describe('buildTagPrompt', () => {
  it('returns a prompt with chapter options', () => {
    const prompt = buildTagPrompt('Папа говорил о школе.', ['Детство', 'Юность']);
    expect(prompt).toContain('Детство');
    expect(prompt).toContain('Юность');
  });
});
```

**Step 2: Run to verify failure**

```bash
npm test -- pipeline
# Expected: FAIL
```

**Step 3: Implement pipeline helpers**

Create `lib/pipeline.ts`:

```typescript
export interface TurnMessage { role: string; text: string; }

export function buildRawTranscript(messages: TurnMessage[]): string {
  return messages
    .map(m => `${m.role === 'assistant' ? 'Интервьюер' : 'Папа'}: ${m.text}`)
    .join('\n\n');
}

export function buildPolishPrompt(rawTranscript: string): string {
  return `Ты литературный редактор. Преврати следующий транскрипт разговора в связный мемуарный текст от первого лица. Сохрани голос и стиль рассказчика. Убери вопросы интервьюера, фильтруй слова-паразиты. Пиши на русском языке.

Транскрипт:
${rawTranscript}

Мемуарный текст:`;
}

export function buildTagPrompt(rawTranscript: string, chapterTitles: string[]): string {
  return `Прочитай транскрипт и определи наиболее подходящую главу мемуаров из списка ниже. Ответь только названием главы, без объяснений.

Главы: ${chapterTitles.join(', ')}

Транскрипт:
${rawTranscript.substring(0, 2000)}

Глава:`;
}

export function buildSummaryPrompt(rawTranscript: string): string {
  return `Напиши краткое резюме (3-5 предложений) того, о чём говорилось в этом интервью. Укажи имена, места, даты и ключевые события. Это резюме будет использовано в будущих сессиях интервью.

Транскрипт:
${rawTranscript.substring(0, 3000)}

Резюме:`;
}
```

**Step 4: Run tests to verify pass**

```bash
npm test -- pipeline
# Expected: PASS
```

**Step 5: Implement session-end route**

Create `app/api/session-end/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  buildRawTranscript, buildPolishPrompt, buildTagPrompt,
  buildSummaryPrompt, TurnMessage
} from '@/lib/pipeline';

export async function POST(req: NextRequest) {
  const { session_id, messages }: { session_id: string; messages: TurnMessage[] } = await req.json();

  const rawText = buildRawTranscript(messages);

  // Save raw transcript immediately
  const { data: transcript } = await supabaseAdmin
    .from('transcripts')
    .insert({ session_id, raw_text: rawText })
    .select()
    .single();

  // Run GPT-4o calls in parallel
  const { data: chapters } = await supabaseAdmin.from('chapters').select('id, title_ru');
  const chapterTitles = chapters?.map(c => c.title_ru) ?? [];

  const [polishRes, tagRes, summaryRes] = await Promise.all([
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: buildPolishPrompt(rawText) }],
    }),
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: buildTagPrompt(rawText, chapterTitles) }],
    }),
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: buildSummaryPrompt(rawText) }],
    }),
  ]);

  const polishedText = polishRes.choices[0].message.content ?? '';
  const taggedChapterTitle = tagRes.choices[0].message.content?.trim() ?? '';
  const sessionSummary = summaryRes.choices[0].message.content ?? '';

  // Find chapter id from tagged title
  const matchedChapter = chapters?.find(c =>
    c.title_ru.toLowerCase() === taggedChapterTitle.toLowerCase()
  );

  // Update transcript + session
  await Promise.all([
    supabaseAdmin.from('transcripts').update({
      polished_text: polishedText,
      session_summary: sessionSummary,
      polished_at: new Date().toISOString(),
    }).eq('id', transcript.id),

    supabaseAdmin.from('sessions').update({
      status: 'complete',
      ended_at: new Date().toISOString(),
      ...(matchedChapter ? { chapter_id: matchedChapter.id } : {}),
    }).eq('id', session_id),
  ]);

  return NextResponse.json({ ok: true });
}
```

**Step 6: Manual test**

```bash
# Start a voice session, speak for 1-2 minutes, tap End
# Check Supabase dashboard > transcripts table
# Verify: raw_text populated, polished_text populated, session_summary populated
# Check sessions table: status = complete, chapter_id assigned
```

**Step 7: Commit**

```bash
git add .
git commit -m "feat: post-session pipeline — polish, chapter tagging, summarization"
```

---

## Task 6: Text + Media Input

**Files:**
- Modify: `app/page.tsx` (wire TextInputBar)
- Create: `app/api/upload/route.ts`

**Step 1: Implement upload route**

Create `app/api/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const sessionId = formData.get('session_id') as string;

  const ext = file.name.split('.').pop();
  const path = `sessions/${sessionId}/${Date.now()}.${ext}`;

  const buffer = await file.arrayBuffer();
  const { error } = await supabaseAdmin.storage
    .from('media')
    .upload(path, buffer, { contentType: file.type });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabaseAdmin.storage.from('media').getPublicUrl(path);

  await supabaseAdmin.from('session_media').insert({
    session_id: sessionId,
    file_url: publicUrl,
    mime_type: file.type,
  });

  return NextResponse.json({ url: publicUrl });
}
```

**Step 2: Wire text + attach into page**

Update `app/page.tsx` — replace the TODO console.log handlers:

```typescript
const handleSendText = async (text: string) => {
  if (!sessionId) return;
  // Save message to DB
  await supabase.from('messages').insert({
    session_id: sessionId,
    role: 'user',
    content_type: 'text',
    content_text: text,
  });
  // Send to AI via data channel
  connection?.dc.send(JSON.stringify({
    type: 'conversation.item.create',
    item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
  }));
  connection?.dc.send(JSON.stringify({ type: 'response.create' }));
  setMessages(prev => [...prev, { role: 'user', text }]);
};

const handleAttach = async (files: FileList) => {
  if (!sessionId) return;
  for (const file of Array.from(files)) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const { url } = await res.json();

    // Tell AI about the attachment
    const caption = `Пользователь прикрепил файл: ${file.name}`;
    connection?.dc.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: caption }] },
    }));
    connection?.dc.send(JSON.stringify({ type: 'response.create' }));
  }
};
```

**Step 3: Create Supabase storage bucket**

In Supabase dashboard: Storage > New bucket > name: `media` > Public: true

**Step 4: Manual test**

```bash
# Start session, type a message → AI responds
# Attach a photo → verify in session_media table, AI acknowledges
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: text input and file/photo attachment support"
```

---

## Task 7: Family View — Auth + Dashboard

**Files:**
- Create: `app/family/page.tsx`
- Create: `app/family/dashboard/page.tsx`
- Create: `middleware.ts`

**Step 1: Implement family login**

Create `app/family/page.tsx`:

```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FamilyLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/family-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push('/family/dashboard');
    } else {
      setError('Неверный пароль');
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <form onSubmit={handleLogin} className="bg-zinc-900 rounded-2xl p-8 w-80 space-y-4">
        <h1 className="text-white text-xl font-semibold text-center">Семейный архив</h1>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Пароль"
          className="w-full bg-white/10 text-white rounded-xl px-4 py-3 outline-none"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-3">
          Войти
        </button>
      </form>
    </main>
  );
}
```

**Step 2: Implement family auth API**

Create `app/api/family-auth/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (password !== process.env.FAMILY_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('family_auth', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
  return response;
}
```

**Step 3: Implement middleware to protect /family/dashboard**

Create `middleware.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const isAuthed = req.cookies.get('family_auth')?.value === 'true';
  if (req.nextUrl.pathname.startsWith('/family/dashboard') && !isAuthed) {
    return NextResponse.redirect(new URL('/family', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/family/dashboard/:path*'] };
```

**Step 4: Implement chapter/session dashboard**

Create `app/family/dashboard/page.tsx`:

```typescript
import { supabaseAdmin } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function Dashboard() {
  const { data: chapters } = await supabaseAdmin
    .from('chapters')
    .select('*, sessions(id, started_at, status)')
    .order('display_order');

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">Воспоминания</h1>
      <div className="space-y-4">
        {chapters?.map(chapter => (
          <div key={chapter.id} className="bg-zinc-900 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-3">{chapter.title_ru}</h2>
            <div className="space-y-2">
              {chapter.sessions?.length === 0 && (
                <p className="text-white/40 text-sm">Нет записей</p>
              )}
              {chapter.sessions?.map((session: { id: string; started_at: string; status: string }) => (
                <Link
                  key={session.id}
                  href={`/family/dashboard/session/${session.id}`}
                  className="flex items-center justify-between bg-white/5 hover:bg-white/10 rounded-xl px-4 py-3 transition-colors"
                >
                  <span className="text-sm text-white/70">
                    {new Date(session.started_at).toLocaleDateString('ru-RU', {
                      day: 'numeric', month: 'long', year: 'numeric'
                    })}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    session.status === 'complete' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {session.status === 'complete' ? 'Завершено' : 'Пауза'}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
```

**Step 5: Manual test**

```bash
# Go to http://localhost:3000/family
# Enter FAMILY_PASSWORD from .env.local
# Verify redirect to dashboard with chapters listed
# Direct access to /family/dashboard without login → redirects to /family
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: family auth with shared password, chapter/session dashboard"
```

---

## Task 8: Transcript Viewer + Comments + Export

**Files:**
- Create: `app/family/dashboard/session/[id]/page.tsx`
- Create: `components/TranscriptViewer.tsx`
- Create: `components/CommentThread.tsx`
- Create: `app/api/export/route.ts`

**Step 1: Implement TranscriptViewer component**

Create `components/TranscriptViewer.tsx`:

```typescript
'use client';
import { useState } from 'react';

interface Props {
  rawText: string;
  polishedText: string;
}

export function TranscriptViewer({ rawText, polishedText }: Props) {
  const [view, setView] = useState<'raw' | 'polished' | 'split'>('split');

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['raw', 'polished', 'split'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              view === v ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/60 hover:text-white'
            }`}
          >
            {v === 'raw' ? 'Транскрипт' : v === 'polished' ? 'Мемуар' : 'Оба'}
          </button>
        ))}
      </div>

      <div className={`grid gap-4 ${view === 'split' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {(view === 'raw' || view === 'split') && (
          <div className="bg-zinc-900 rounded-xl p-4">
            <h3 className="text-white/50 text-xs uppercase mb-3">Оригинальный транскрипт</h3>
            <pre className="text-white/80 text-sm whitespace-pre-wrap font-sans leading-relaxed">
              {rawText}
            </pre>
          </div>
        )}
        {(view === 'polished' || view === 'split') && (
          <div className="bg-zinc-900 rounded-xl p-4">
            <h3 className="text-white/50 text-xs uppercase mb-3">Литературная версия</h3>
            <p className="text-white text-sm leading-relaxed">{polishedText}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Implement session page with export buttons**

Create `app/family/dashboard/session/[id]/page.tsx`:

```typescript
import { supabaseAdmin } from '@/lib/supabase/server';
import { TranscriptViewer } from '@/components/TranscriptViewer';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function SessionPage({ params }: { params: { id: string } }) {
  const { data: session } = await supabaseAdmin
    .from('sessions')
    .select('*, transcripts(*), chapters(title_ru)')
    .eq('id', params.id)
    .single();

  if (!session) notFound();

  const transcript = session.transcripts?.[0];

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/family/dashboard" className="text-white/40 text-sm hover:text-white">
            ← Назад
          </Link>
          <h1 className="text-xl font-bold mt-1">
            {session.chapters?.title_ru ?? 'Свободный разговор'}
          </h1>
          <p className="text-white/40 text-sm">
            {new Date(session.started_at).toLocaleDateString('ru-RU', {
              day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
            })}
          </p>
        </div>

        {transcript && (
          <div className="flex gap-2">
            <a
              href={`/api/export?session_id=${session.id}&type=raw`}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            >
              ↓ Транскрипт .txt
            </a>
            <a
              href={`/api/export?session_id=${session.id}&type=polished`}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            >
              ↓ Мемуар .txt
            </a>
            <a
              href={`/api/export?session_id=${session.id}&type=pdf`}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors"
            >
              ↓ PDF
            </a>
          </div>
        )}
      </div>

      {transcript ? (
        <TranscriptViewer
          rawText={transcript.raw_text ?? ''}
          polishedText={transcript.polished_text ?? ''}
        />
      ) : (
        <p className="text-white/40">Транскрипт ещё обрабатывается...</p>
      )}
    </main>
  );
}
```

**Step 3: Implement export API**

Create `app/api/export/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { jsPDF } from 'jspdf';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sessionId = searchParams.get('session_id');
  const type = searchParams.get('type') as 'raw' | 'polished' | 'pdf';

  const { data: transcript } = await supabaseAdmin
    .from('transcripts')
    .select('*, sessions(chapters(title_ru), started_at)')
    .eq('session_id', sessionId)
    .single();

  if (!transcript) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (type === 'raw') {
    return new NextResponse(transcript.raw_text ?? '', {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="transcript-${sessionId}.txt"`,
      },
    });
  }

  if (type === 'polished') {
    return new NextResponse(transcript.polished_text ?? '', {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="memoir-${sessionId}.txt"`,
      },
    });
  }

  if (type === 'pdf') {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const chapter = (transcript.sessions as Record<string, unknown>)?.chapters as Record<string, unknown>;
    const title = (chapter?.title_ru as string) ?? 'Воспоминания';
    const date = new Date((transcript.sessions as Record<string, unknown>)?.started_at as string)
      .toLocaleDateString('ru-RU');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title, 20, 25);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(date, 20, 33);
    doc.setTextColor(0);
    doc.setFontSize(12);

    const lines = doc.splitTextToSize(transcript.polished_text ?? '', 170);
    doc.text(lines, 20, 45);

    const pdfBuffer = doc.output('arraybuffer');
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="memoir-${sessionId}.pdf"`,
      },
    });
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}
```

**Step 4: Manual test**

```bash
# Complete a session → open in family dashboard
# Click each export button: raw .txt, polished .txt, PDF
# Verify all three download correctly
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: transcript viewer, export raw txt / polished txt / PDF"
```

---

## Task 9: Heritage Docs Upload + Summarization

**Files:**
- Add heritage docs section to `app/family/dashboard/page.tsx`
- Create: `app/api/heritage/route.ts`

**Step 1: Implement heritage upload API**

Create `app/api/heritage/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File;

  // Upload to Supabase Storage
  const path = `heritage/${Date.now()}-${file.name}`;
  const buffer = await file.arrayBuffer();
  await supabaseAdmin.storage.from('media').upload(path, buffer, { contentType: file.type });
  const { data: { publicUrl } } = supabaseAdmin.storage.from('media').getPublicUrl(path);

  // Extract text content (basic — works for .txt; for PDF/DOCX, parse separately)
  const text = await file.text();

  // GPT-4o summary extraction
  const summaryRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: `Прочитай следующий документ о семье и напиши плотное резюме (максимум 300 слов) всех ключевых фактов: имена, даты, места, события, семейные связи. Это резюме будет использовано как контекст для интервьюера.\n\n${text.substring(0, 8000)}`,
    }],
  });

  const summaryText = summaryRes.choices[0].message.content ?? '';

  await supabaseAdmin.from('heritage_docs').insert({
    filename: file.name,
    file_url: publicUrl,
    mime_type: file.type,
    summary_text: summaryText,
  });

  return NextResponse.json({ ok: true, summary: summaryText });
}
```

**Step 2: Add heritage upload section to dashboard**

Add to bottom of `app/family/dashboard/page.tsx`:

```typescript
// Add HeritageSection component inline
async function HeritageSection() {
  const { data: docs } = await supabaseAdmin.from('heritage_docs').select('*');
  return (
    <div className="mt-12">
      <h2 className="text-lg font-semibold mb-4">Семейные документы</h2>
      <div className="space-y-2 mb-4">
        {docs?.map(doc => (
          <div key={doc.id} className="bg-zinc-900 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-white/60 text-sm">{doc.filename}</span>
            {doc.summary_text && <span className="text-green-400 text-xs">✓ Обработан</span>}
          </div>
        ))}
      </div>
      {/* Upload form — client component */}
      <HeritageUpload />
    </div>
  );
}
```

Create `components/HeritageUpload.tsx` as a `'use client'` component with a file input that posts to `/api/heritage`.

**Step 3: Manual test**

```bash
# Upload a .txt file with family history
# Check heritage_docs table: summary_text populated
# Start new voice session → AI should reference heritage context
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: heritage doc upload with GPT-4o summary extraction"
```

---

## Task 10: Deploy to Vercel

**Step 1: Push to GitHub**

```bash
git remote add origin https://github.com/<your-username>/memoir-app.git
git push -u origin main
```

**Step 2: Create Vercel project**

```bash
npx vercel
# Follow prompts: link to GitHub repo, auto-detect Next.js
```

**Step 3: Add environment variables in Vercel dashboard**

Settings > Environment Variables — add all variables from `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `FAMILY_PASSWORD`

**Step 4: Redeploy and verify**

```bash
npx vercel --prod
# Copy the production URL
# Test: voice session, family dashboard, exports
```

**Step 5: Bookmark dad's URL**

```
https://your-app.vercel.app  → bookmark this for dad
https://your-app.vercel.app/family  → share with family
```

---

## Testing Checklist (manual, end-to-end)

- [ ] Dad's link opens orb directly, no login
- [ ] Tap orb → microphone permission → AI greets in Russian
- [ ] Dad speaks → AI responds with follow-up question
- [ ] Silence for 8s → AI prompts gently
- [ ] Chapter sidebar opens via ☰, selecting one focuses AI
- [ ] Pause saves session, End triggers pipeline
- [ ] Text input sends message to AI
- [ ] Photo attachment → AI acknowledges file
- [ ] Family login with wrong password → error message
- [ ] Family login with correct password → dashboard
- [ ] Completed session appears in correct chapter
- [ ] Transcript viewer shows raw + polished
- [ ] Raw .txt download works
- [ ] Polished .txt download works
- [ ] PDF download works with correct chapter title
- [ ] Heritage doc upload → summary in DB → AI uses context in next session

---

## Open Questions

- PDF export currently uses jsPDF with helvetica (Latin only). For Russian Cyrillic in PDFs, add a Cyrillic-capable font file or switch to Puppeteer for PDF generation.
- Comments feature deferred to post-MVP (DB schema is ready, UI not built).
- Full-book PDF (all chapters) deferred to post-MVP.
