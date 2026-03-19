# Memoir App — Design Document
_Created: 2026-03-02 · Updated: 2026-03-19_

## Overview

A voice-first web app that interviews an elderly Russian-speaking person (Alexander Grigoryevich) about his life. The AI interviewer listens, asks follow-up questions, and after each session the system polishes the raw conversation into memoir prose, which the family can read and export.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, React 19) |
| Hosting | Vercel |
| Database + Auth + Storage | Supabase |
| Voice AI | OpenAI Realtime API (`gpt-4o-realtime-preview`, WebRTC) |
| Post-processing AI | GPT-4o (polish, tagging, summarization, titles) |
| Styling | Tailwind CSS v4, Framer Motion |
| PDF export | jsPDF |
| Language | Russian throughout |

---

## Users & Access

| User | Access |
|---|---|
| Alexander Grigoryevich | Direct link — no login, straight to voice interface |
| Family | `/family` — single shared password (`FAMILY_PASSWORD`) |

---

## Design System

Warm, nostalgic palette. The app is about precious memories — the design reflects that.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0d0b09` | Page backgrounds |
| `--bg-card` | `#1c1914` | Cards, panels |
| `--accent` | `#d4a853` | Accent, active elements |
| `--accent-dim` | `rgba(212,168,83,0.12)` | Active chip backgrounds |
| `--text` | `#f0ece4` | Primary text |
| `--text-muted` | `#7a6f62` | Secondary text, captions |
| `--border` | `#2a2118` | Dividers, outlines |

Font: Geist via `next/font`.

---

## Dad's Interface

Voice is the single primary action. The interface must not distract.

### Main screen

**Header:**
- "Memoir" title (amber)
- "Семейный архив →" link on the right

**Chapter chips (always visible):**
- Horizontal row of pill chips: one per chapter (no "free" topic)
- Active chip highlighted in amber
- Selection locked during an active session

**Orb:**
- Amber gradient `#e8c06a → #c9893a → #8b4e1a` with soft glow
- States: idle / listening / speaking / thinking — distinct animations
- Label below: "Нажмите, чтобы начать" / "Слушаю вас..." / "Думаю..." / "Отвечаю..."
- Tap to start a session

**Session controls (visible only during an active session):**
- 📷 **Photo** — attach a photo or file to the current session
- ⏸ **Pause** — save and continue later
- ✕ **End** — close session, trigger post-processing pipeline

---

## AI Interviewer Behaviour

- Addresses the subject as "Александр Григорьевич" or "вы" only — no "дорогой" or similar
- Uses the name at most once every few exchanges
- One question per turn — asks, then waits silently for as long as needed
- Each question connects to the previous answer (deepens, contrasts, or picks up a detail)
- Never jumps to a new topic without a bridge
- If heritage documents are loaded: references specific facts, names, and dates from them

---

## Interviewer System Prompt Structure

1. Role + tone (warm, curious, patient Russian interviewer)
2. Address rules (вы, one question at a time, never fill silence)
3. Chapter goal (current topic or open-ended)
4. Heritage knowledge base — pre-extracted facts from family documents
5. Previous sessions summary — what has already been discussed (no repetition)
6. Greeting instruction — how to open this specific session

---

## Post-Session Pipeline

Triggered by `/api/session-end` after the user taps End:

1. Count user words — if < 8, mark session complete with no transcript
2. Save raw transcript immediately (never lost even if GPT fails)
3. Parallel GPT-4o calls (all wrapped in try/catch):
   - **Polish** — convert raw dialogue to memoir prose
   - **Summarise** — 2–3 sentence session summary for future context
   - **Title** — 3–6 word specific title; aware of all existing titles
   - **Tag** — match to the most relevant chapter

---

## Heritage Documents

Family uploads PDF, DOCX, or TXT documents (biographies, family trees, etc.).

1. **Upload** — file saved to Supabase Storage; `summary_text = null`
2. **Prepare** (one-time, manual) — download from Supabase, upload to OpenAI Files API, extract a structured biographical fact list, cache in `summary_text`
3. **Session use** — `session-token` reads cached `summary_text` only (fast, no extraction at session start)

---

## Archive

### Chapters
- Детство, Юность, Работа и карьера, Семья, Путешествия, Важные события
- Sessions without transcripts are hidden from all listings

### Session detail
- Shows polished memoir text + raw dialogue tabs
- Inline title editing
- Photo gallery
- Export: polished .txt, raw .txt, PDF
- If pipeline failed: shows a Retry button to rerun processing

### Family dashboard
- Read-only view of all sessions by chapter
- Same export options

---

## Open / Deferred

- PDF export uses jsPDF with Latin fonts; Cyrillic may render incorrectly → consider Puppeteer
- Comments feature: DB schema ready, UI not built
- Full-book PDF across all chapters: deferred to post-MVP
