import { POST } from '@/app/api/session-token/route';
import { NextRequest } from 'next/server';

// Mock OpenAI
vi.mock('@/lib/openai', () => ({
  openai: {
    beta: {
      realtime: {
        sessions: {
          create: vi.fn().mockResolvedValue({
            client_secret: { value: 'test-ephemeral-token' },
          }),
        },
      },
    },
  },
}));

// Mock Supabase admin
vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({
            data: { id: 'session-123', chapter_id: null, status: 'active' },
            error: null,
          }),
        }),
      }),
    }),
  },
}));

describe('POST /api/session-token', () => {
  it('returns ephemeral token and session id', async () => {
    const req = new NextRequest('http://localhost/api/session-token', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.client_secret.value).toBe('test-ephemeral-token');
    expect(body.session_id).toBe('session-123');
  });

  it('passes chapter_id to session when provided', async () => {
    const { openai } = await import('@/lib/openai');
    const createSpy = vi.mocked(openai.beta.realtime.sessions.create);

    const req = new NextRequest('http://localhost/api/session-token', {
      method: 'POST',
      body: JSON.stringify({ chapter_id: 'chapter-abc' }),
      headers: { 'Content-Type': 'application/json' },
    });

    await POST(req);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o-realtime-preview' })
    );
  });
});
