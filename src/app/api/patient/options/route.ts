import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    if (!await isAuthenticated()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const PAGE_SIZE = 1000;
    const patients: Array<{ id: string; display_name: string }> = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
            .from('canonical_patient')
            .select('id, display_name')
            .order('display_name', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!data || data.length === 0) break;
        patients.push(...data);
        if (data.length < PAGE_SIZE) break;
    }

    return NextResponse.json({ patients });
}
