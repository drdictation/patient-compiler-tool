
export interface BridgeRecord {
    id: number;
    patient_name: string;
    patient_id?: string;
    date_of_birth?: string;
    consult_date: string;
    created_at: string;
    transcription: string; // "Raw" transcript
    ai_formatted_transcription?: string;
    letter_draft?: string;
    status: string;
}

export interface BridgeResponse {
    records: BridgeRecord[];
    next_cursor: number | null;
    total_returned: number;
}

export async function fetchBridgeRecords(cursor = 0, limit = 50, sinceDate?: string): Promise<BridgeResponse> {
    const baseUrl = process.env.BRIDGE_API_URL;
    const apiKey = process.env.BRIDGE_API_KEY;

    if (!baseUrl || !apiKey) {
        throw new Error('Bridge API configuration missing');
    }

    const url = new URL(`${baseUrl}/api/bridge/records`);
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('cursor', cursor.toString());
    if (sinceDate) {
        url.searchParams.set('since_date', sinceDate);
    }

    const res = await fetch(url.toString(), {
        headers: {
            'x-bridge-api-key': apiKey,
        },
        // Don't cache these requests as we want fresh data
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`Bridge API Error: ${res.status} ${res.statusText}`);
    }

    return res.json();
}
