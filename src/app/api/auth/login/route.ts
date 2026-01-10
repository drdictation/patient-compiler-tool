
import { NextResponse } from 'next/server';
import { verifyPassword, AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const { password } = await request.json();

        if (!password) {
            return NextResponse.json({ error: 'Password required' }, { status: 400 });
        }

        const isValid = await verifyPassword(password);

        if (!isValid) {
            return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
        }

        const response = NextResponse.json({ success: true });

        // Set HTTP-only cookie
        response.cookies.set({
            name: AUTH_COOKIE_NAME,
            value: 'authenticated', // Simple boolean flag for now, could be JWT later
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: AUTH_COOKIE_MAX_AGE,
        });

        return response;
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
