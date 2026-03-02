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

-- Session media
create table session_media (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  file_url text not null,
  mime_type text,
  ai_caption text,
  created_at timestamptz default now()
);

-- RLS: disable for now (personal app)
alter table sessions disable row level security;
alter table messages disable row level security;
alter table transcripts disable row level security;
alter table comments disable row level security;
alter table heritage_docs disable row level security;
alter table chapters disable row level security;
alter table session_media disable row level security;
