-- Enable RLS on all tables.
-- The service role (used by supabaseAdmin in API routes) bypasses RLS automatically.
-- No policies are added: the anon key has zero direct table access.
-- All data access goes through server-side Next.js API routes.

ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE heritage_docs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_media   ENABLE ROW LEVEL SECURITY;
