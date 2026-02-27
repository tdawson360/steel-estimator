import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/projects/:path*',
    '/customers/:path*',
    '/admin/:path*',
    '/api/projects/:path*',
    '/api/admin/:path*',
    '/api/dashboard/:path*',
    '/api/notifications/:path*',
    '/api/import-csv/:path*',
    '/api/customers/:path*',
  ],
};
