
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAuthenticated } from '@/lib/auth';

export async function POST(request: Request) {
    if (!isAuthenticated()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { ids } = await request.json();
        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: 'Invalid IDs' }, { status: 400 });
        }

        for (const id of ids) {
            // Cascading delete for each patient
            // (Reusing logic from single delete)
            const { data: encounters } = await supabase
                .from('encounter')
                .select('id')
                .eq('canonical_patient_id', id);

            const encounterIds = encounters?.map(e => e.id) || [];

            if (encounterIds.length > 0) {
                const { data: artifacts } = await supabase
                    .from('artifact')
                    .select('id')
                    .in('encounter_id', encounterIds);

                const artifactIds = artifacts?.map(a => a.id) || [];

                if (artifactIds.length > 0) {
                    await supabase.from('artifact_version').delete().in('artifact_id', artifactIds);
                    await supabase.from('artifact').delete().in('id', artifactIds);
                }
                await supabase.from('encounter').delete().in('id', encounterIds);
            }
            await supabase.from('source_record_cache').delete().eq('canonical_patient_id', id);
            await supabase.from('canonical_patient').delete().eq('id', id);
        }

        return NextResponse.json({ success: true, count: ids.length });
    } catch (error: any) {
        console.error('Bulk delete error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
