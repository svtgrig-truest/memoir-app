-- Add short_title to transcripts for display in session lists
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS short_title text;
