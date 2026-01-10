
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    // 1. Auth Check (Search is sensitive)
    if (!await isAuthenticated()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.trim().length < 2) {
        return NextResponse.json({ results: [] });
    }

    // 2. Perform Full-Text Search
    // We search the 'searchable_content' view using the 'websearch_to_tsquery' for natural language
    const { data, error } = await supabase
        .from('searchable_content')
        .select(`
      content_type,
      content_id,
      patient_id,
      patient_name,
      patient_identity,
      consult_date,
      title,
      snippet
    `)
        .textSearch('search_vector', query, {
            type: 'websearch',
            config: 'english'
        })
        .limit(20);

    if (error) {
        console.error('Search error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 3. Format Results
    const results = data.map((item: any) => ({
        type: item.content_type,
        id: item.content_id,
        patient_id: item.patient_id,
        patient_name: item.patient_name,
        patient_identity: item.patient_identity,
        date: item.consult_date,
        title: item.title,
        snippet: item.snippet,
    }));

    return NextResponse.json({ results });
}
