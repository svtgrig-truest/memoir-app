// Runs once on server startup (Node.js runtime only).
// Ensures the Supabase Storage bucket for audio recordings exists.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) {
      console.error('[startup] listBuckets failed:', listErr.message);
      return;
    }

    if (!buckets?.some((b) => b.name === 'recordings')) {
      const { error } = await supabase.storage.createBucket('recordings', {
        public: false,
        allowedMimeTypes: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'],
        fileSizeLimit: 500 * 1024 * 1024, // 500 MB
      });
      if (error) console.error('[startup] recordings bucket creation failed:', error.message);
      else console.log('[startup] recordings bucket created ✓');
    } else {
      console.log('[startup] recordings bucket OK ✓');
    }
  } catch (err) {
    console.error('[startup] storage setup error:', err);
  }
}
