
import { cookies } from 'next/headers';

export const AUTH_COOKIE_NAME = 'pc_auth_token';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function isAuthenticated() {
    const cookieStore = await cookies();
    return cookieStore.has(AUTH_COOKIE_NAME);
}

export async function verifyPassword(password: string) {
    const correctPassword = process.env.APP_PASSWORD;
    if (!correctPassword) return false;
    return password === correctPassword;
}
