
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAuthenticated } from '@/lib/auth';
import { cleanPatientDisplayName, normalizePatientName } from '@/app/actions';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!(await isAuthenticated())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        const { displayName } = await request.json();

        if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
            return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
        }

        const cleanName = cleanPatientDisplayName(displayName);
        const normalizedName = normalizePatientName(cleanName);

        // Check if ANOTHER patient already exists with this normalized name
        const { data: conflict } = await supabase
            .from('canonical_patient')
            .select('id, display_name')
            .eq('normalized_name', normalizedName)
            .neq('id', id)
            .maybeSingle();

        if (conflict) {
            return NextResponse.json({
                error: `A patient named "${conflict.display_name}" already exists. Use the Merge tool on the dashboard to combine their records.`
            }, { status: 409 });
        }

        const { error } = await supabase
            .from('canonical_patient')
            .update({
                display_name: cleanName,
                normalized_name: normalizedName,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true, displayName: cleanName });
    } catch (error: any) {
        console.error('Update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!(await isAuthenticated())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        // 1. Delete Artifact Versions (Grandchildren of Encounters)
        // We need to find all artifacts for this patient first, but that's complex.
        // Easier approach: Get all encounters -> Get artifacts -> Delete versions.
        // actually, let's try to delete from top down or use cascade if possible.
        // Since we didn't set cascade, we must be explicit.

        // A. Find Encounters
        const { data: encounters } = await supabase
            .from('encounter')
            .select('id')
            .eq('canonical_patient_id', id);

        const encounterIds = encounters?.map(e => e.id) || [];

        if (encounterIds.length > 0) {
            // B. Find Artifacts
            const { data: artifacts } = await supabase
                .from('artifact')
                .select('id')
                .in('encounter_id', encounterIds);

            const artifactIds = artifacts?.map(a => a.id) || [];

            if (artifactIds.length > 0) {
                // C. Delete Artifact Versions
                await supabase.from('artifact_version').delete().in('artifact_id', artifactIds);
                // D. Delete Artifacts
                await supabase.from('artifact').delete().in('id', artifactIds);
            }

            // E. Delete Encounters
            await supabase.from('encounter').delete().in('id', encounterIds);
        }

        // 2. Delete Source Records
        await supabase.from('source_record_cache').delete().eq('canonical_patient_id', id);

        // 3. Delete Patient
        const { error } = await supabase.from('canonical_patient').delete().eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Delete error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
