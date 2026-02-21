
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME } from './lib/auth';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Paths that are always open
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/static') ||
        pathname.startsWith('/api/auth') || // Allow login API
        pathname.startsWith('/api/transcribe') || // Allow transcribe API (auth checked inside or allowed open for authenticated users locally)
        pathname === '/login' ||
        pathname === '/favicon.ico'
    ) {
        return NextResponse.next();
    }

    // Check for auth cookie
    const token = request.cookies.get(AUTH_COOKIE_NAME);

    if (!token) {
        // Redirect to login if no token
        const loginUrl = new URL('/login', request.url);
        // Optional: Add ?next=... handling
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api/auth (handled above)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
    ],
};
