
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAuthenticated } from '@/lib/auth';

export async function POST(request: Request) {
    if (!isAuthenticated()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { targetId, sourceIds } = await request.json();
        if (!targetId || !Array.isArray(sourceIds) || sourceIds.length === 0) {
            return NextResponse.json({ error: 'Invalid merge parameters' }, { status: 400 });
        }

        for (const sourceId of sourceIds) {
            if (sourceId === targetId) continue;

            // 1. Reassign Source Records
            await supabase
                .from('source_record_cache')
                .update({ canonical_patient_id: targetId })
                .eq('canonical_patient_id', sourceId);

            // 2. Resolve Encounters
            const { data: sourceEncounters } = await supabase
                .from('encounter')
                .select('*, artifacts:artifact(*)')
                .eq('canonical_patient_id', sourceId);

            for (const sEnc of sourceEncounters || []) {
                // Check if target has encounter on same date
                const { data: tEnc } = await supabase
                    .from('encounter')
                    .select('id')
                    .eq('canonical_patient_id', targetId)
                    .eq('encounter_date', sEnc.encounter_date)
                    .single();

                if (tEnc) {
                    // COLLISION: Target already has an encounter on this date.
                    // Move artifacts from source encounter to target encounter.
                    const { data: sArtifacts } = await supabase
                        .from('artifact')
                        .select('*, versions:artifact_version(*)')
                        .eq('encounter_id', sEnc.id);

                    for (const sArt of sArtifacts || []) {
                        // Does target have this type?
                        const { data: tArt } = await supabase
                            .from('artifact')
                            .select('*, versions:artifact_version(*)')
                            .eq('encounter_id', tEnc.id)
                            .eq('artifact_type', sArt.artifact_type)
                            .single();

                        const sourceLatest = (sArt.versions || []).sort((a: any, b: any) => b.version_number - a.version_number)[0];

                        if (tArt && sourceLatest) {
                            // APPEND Content to target artifact
                            const targetLatest = (tArt.versions || []).sort((a: any, b: any) => b.version_number - a.version_number)[0];
                            const newContent = `${targetLatest?.content || ''}\n\n--- MERGED DATA ---\n${sourceLatest.content}`;

                            // Create new version for target artifact
                            await supabase.from('artifact_version').insert({
                                artifact_id: tArt.id,
                                version_number: (tArt.current_version || 1) + 1,
                                content: newContent
                            });

                            await supabase.from('artifact').update({
                                current_version: (tArt.current_version || 1) + 1,
                                updated_at: new Date().toISOString()
                            }).eq('id', tArt.id);

                            // Delete source artifact
                            await supabase.from('artifact_version').delete().eq('artifact_id', sArt.id);
                            await supabase.from('artifact').delete().eq('id', sArt.id);
                        } else {
                            // No collision of TYPE or no content, just move it
                            await supabase.from('artifact').update({ encounter_id: tEnc.id }).eq('id', sArt.id);
                        }
                    }
                    // Delete the source encounter now that it's empty
                    await supabase.from('encounter').delete().eq('id', sEnc.id);
                } else {
                    // NO COLLISION: Just reassign the encounter to the target patient
                    await supabase.from('encounter').update({ canonical_patient_id: targetId }).eq('id', sEnc.id);
                }
            }

            // 3. Delete Source Patient
            await supabase.from('canonical_patient').delete().eq('id', sourceId);

            // 4. Log Event
            await supabase.from('patient_merge_event').insert({
                event_type: 'MERGE',
                source_patient_id: sourceId,
                target_patient_id: targetId,
                reason: 'Manual bulk merge from dashboard'
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Merge error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
