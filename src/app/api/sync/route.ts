
import { NextResponse } from 'next/server';
import { syncRecords } from '@/lib/sync';

export async function POST() {
    try {
        const result = await syncRecords();
        return NextResponse.json({ success: true, ...result });
    } catch (err: any) {
        console.error('Sync failed:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
