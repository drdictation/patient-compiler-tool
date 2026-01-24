
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    if (!await isAuthenticated()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.trim().length < 2) {
        return NextResponse.json({ patients: [] });
    }

    const { data, error } = await supabase
        .from('canonical_patient')
        .select('id, display_name, date_of_birth')
        .or(`display_name.ilike.%${query}%,normalized_name.ilike.%${query}%`)
        .limit(10);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ patients: data });
}
