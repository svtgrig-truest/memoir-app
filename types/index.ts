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
