// Local Phone Audio Cache (IndexedDB)
// Temporarily buffers audio chunks strictly on the clinician's local phone memory during recording.
// NEVER stores audio in Supabase. Cleared immediately once transcription succeeds.

const DB_NAME = 'pct_audio_cache';
const DB_VERSION = 1;
const STORE_NAME = 'recording_drafts';

interface AudioDraft {
    id: string; // e.g. patientId or 'current_draft'
    patientId: string;
    patientName: string;
    noteType: string;
    chunks: Blob[];
    mimeType: string;
    updatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            reject(new Error('IndexedDB not supported'));
            return;
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Saves current recording chunks into local browser IndexedDB.
 */
export async function saveLocalAudioDraft(draft: {
    patientId: string;
    patientName: string;
    noteType: string;
    chunks: Blob[];
    mimeType: string;
}): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const record: AudioDraft = {
                id: 'active_consult_draft',
                patientId: draft.patientId,
                patientName: draft.patientName,
                noteType: draft.noteType,
                chunks: draft.chunks,
                mimeType: draft.mimeType,
                updatedAt: Date.now(),
            };
            store.put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('[AudioCache] Could not save draft to IndexedDB:', e);
    }
}

/**
 * Retrieves cached audio draft if one exists.
 */
export async function getLocalAudioDraft(): Promise<AudioDraft | null> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get('active_consult_draft');
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    } catch {
        return null;
    }
}

/**
 * Clears the local audio cache upon successful transcription / document generation.
 */
export async function clearLocalAudioDraft(): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete('active_consult_draft');
            tx.oncomplete = () => {
                console.log('[AudioCache] Local audio cache cleared.');
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('[AudioCache] Could not clear IndexedDB draft:', e);
    }
}
