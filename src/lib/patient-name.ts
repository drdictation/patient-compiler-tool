/**
 * Patient Name Utilities
 * Pure string functions for cleaning, stripping honorifics, and normalizing patient names.
 */

/**
 * Strips leading honorifics / titles (Mr, Mrs, Ms, Miss, Dr, Prof, etc.) and collapses whitespace.
 * e.g. "Ms. Vanessa Lynn" -> "Vanessa Lynn"
 * e.g. "Dr Robert Jones" -> "Robert Jones"
 * e.g. "Mr. John  Smith " -> "John Smith"
 */
export function cleanPatientDisplayName(rawName: string): string {
    if (!rawName) return 'Unknown Patient';
    let cleaned = rawName.trim();
    // Remove leading titles/honorifics case-insensitively
    cleaned = cleaned.replace(/^(mr|mrs|ms|miss|dr|prof|professor|master|mstr|mx|rev|reverend)\.?\s+/i, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned || rawName.trim();
}

/**
 * Normalizes patient name for reliable DB unique index lookup.
 * Always strips titles, converts to lowercase, collapses whitespace.
 */
export function normalizePatientName(rawName: string): string {
    const cleaned = cleanPatientDisplayName(rawName);
    return cleaned.toLowerCase().trim().replace(/\s+/g, ' ');
}
