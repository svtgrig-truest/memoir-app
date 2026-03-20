import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  const expected = process.env.FAMILY_PASSWORD ?? '';

  if (!password || password !== expected) {
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('app_auth', '1', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
    sameSite: 'lax',
  });
  return res;
}
