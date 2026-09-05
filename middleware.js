import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

// API clients need machine-readable auth failures. Redirecting an expired-session
// fetch to the /login page hands HTML to code expecting JSON — worse, a followed
// redirect can 200 and make a failed save look successful.
export async function middleware(req) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET,
  });

  if (token) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Session expired', code: 'SESSION_EXPIRED' },
      { status: 401 },
    );
  }

  const login = new URL('/login', req.url);
  login.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/projects/:path*',
    '/customers/:path*',
    '/drawings/:path*',
    '/api/drawings/:path*',
    '/admin/:path*',
    '/api/projects/:path*',
    '/api/admin/:path*',
    '/api/dashboard/:path*',
    '/api/notifications/:path*',
    '/api/import-csv/:path*',
    '/api/customers/:path*',
  ],
};
