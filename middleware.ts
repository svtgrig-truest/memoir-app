import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const isAuthed = req.cookies.get('family_auth')?.value === 'true';

  if (!isAuthed) {
    return NextResponse.redirect(new URL('/family', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/family/dashboard/:path*', '/api/heritage'],
};
