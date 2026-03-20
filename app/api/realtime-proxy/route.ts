export const maxDuration = 30;

import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const { sdp, token } = await req.json().catch(() => ({}));

  if (!sdp || !token) {
    return new Response(JSON.stringify({ error: 'Missing sdp or token' }), { status: 400 });
  }

  const response = await fetch(
    'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/sdp',
      },
      body: sdp,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    return new Response(JSON.stringify({ error: `OpenAI error: ${response.status}`, detail: text }), {
      status: response.status,
    });
  }

  const answerSdp = await response.text();
  return new Response(answerSdp, {
    headers: { 'Content-Type': 'application/sdp' },
  });
}
