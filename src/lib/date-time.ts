export const MELBOURNE_TIME_ZONE = 'Australia/Melbourne';

/** Return the calendar date in Melbourne, independent of browser/server timezone. */
export function getMelbourneDate(date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-AU', {
        timeZone: MELBOURNE_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const value = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find(part => part.type === type)?.value;

    return `${value('year')}-${value('month')}-${value('day')}`;
}

export const ROSTER_EXPIRATION_HOURS = 18;

/** Check whether a roster updated at the given timestamp has exceeded the expiration window (default 18h). */
export function isRosterExpired(
    updatedAt: string | number | Date | null | undefined,
    maxAgeHours = ROSTER_EXPIRATION_HOURS
): boolean {
    if (!updatedAt) return true;
    const time = new Date(updatedAt).getTime();
    if (isNaN(time)) return true;
    const ageMs = Date.now() - time;
    return ageMs > maxAgeHours * 60 * 60 * 1000;
}

/** Formats remaining time before a roster expires (e.g. "14h 20m" or "45m"). */
export function formatRosterExpiryRemaining(
    updatedAt: string | number | Date | null | undefined,
    maxAgeHours = ROSTER_EXPIRATION_HOURS
): string {
    if (!updatedAt) return '';
    const time = new Date(updatedAt).getTime();
    if (isNaN(time)) return '';
    const remainingMs = (maxAgeHours * 60 * 60 * 1000) - (Date.now() - time);
    if (remainingMs <= 0) return 'expired';
    const totalMinutes = Math.floor(remainingMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}
