// Screen Wake Lock API utility for preventing device standby during recording and AI generation

let wakeLockSentinel: WakeLockSentinel | null = null;
let isRequested = false;

/**
 * Requests a screen wake lock to keep the device display active.
 * Safe to call in unsupported environments (gracefully no-ops).
 */
export async function requestScreenWakeLock(): Promise<boolean> {
    if (typeof window === 'undefined' || !('wakeLock' in navigator)) {
        console.warn('[WakeLock] Screen Wake Lock API is not supported in this browser.');
        return false;
    }

    isRequested = true;

    try {
        if (wakeLockSentinel && !wakeLockSentinel.released) {
            return true;
        }

        wakeLockSentinel = await navigator.wakeLock.request('screen');
        console.log('[WakeLock] Screen Wake Lock acquired.');

        wakeLockSentinel.addEventListener('release', () => {
            console.log('[WakeLock] Screen Wake Lock released.');
            wakeLockSentinel = null;
        });

        // Re-acquire wake lock if user switches back to the tab while it's still requested
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return true;
    } catch (err) {
        console.warn('[WakeLock] Failed to acquire screen wake lock:', err);
        return false;
    }
}

/**
 * Releases the active screen wake lock, allowing the device to sleep normally.
 */
export async function releaseScreenWakeLock(): Promise<void> {
    isRequested = false;
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    if (wakeLockSentinel) {
        try {
            await wakeLockSentinel.release();
        } catch (err) {
            console.warn('[WakeLock] Error releasing screen wake lock:', err);
        } finally {
            wakeLockSentinel = null;
            console.log('[WakeLock] Screen Wake Lock explicitly cleared.');
        }
    }
}

async function handleVisibilityChange() {
    if (isRequested && document.visibilityState === 'visible') {
        // Re-acquire when user returns to tab
        await requestScreenWakeLock();
    }
}
