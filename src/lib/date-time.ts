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
