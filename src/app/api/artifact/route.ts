
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAuthenticated } from '@/lib/auth';

export async function POST(request: Request) {
    // 1. Auth Check
    if (!await isAuthenticated()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { encounterId, artifactType, content } = await request.json();

        if (!encounterId || !artifactType || !content) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        // 2. Upsert Artifact container (get ID if exists, create if not)
        // We select first to see if it exists to increment version properly
        const { data: existingArtifact, error: findError } = await supabase
            .from('artifact')
            .select('id, current_version')
            .eq('encounter_id', encounterId)
            .eq('artifact_type', artifactType)
            .single();

        let artifactId = existingArtifact?.id;
        let nextVersion = (existingArtifact?.current_version || 0) + 1;

        if (!existingArtifact) {
            // Create new
            const { data: newArtifact, error: createError } = await supabase
                .from('artifact')
                .insert({
                    encounter_id: encounterId,
                    artifact_type: artifactType,
                    current_version: 1
                })
                .select('id')
                .single();

            if (createError) throw new Error(createError.message);
            artifactId = newArtifact.id;
            nextVersion = 1;
        } else {
            // Update current version pointer
            await supabase
                .from('artifact')
                .update({ current_version: nextVersion, updated_at: new Date().toISOString() })
                .eq('id', artifactId);
        }

        // 3. Create Immutable Version
        const { error: versionError } = await supabase
            .from('artifact_version')
            .insert({
                artifact_id: artifactId,
                version_number: nextVersion,
                content: content
            });

        if (versionError) throw new Error(versionError.message);

        return NextResponse.json({ success: true, version: nextVersion });
    } catch (err: any) {
        console.error('Save artifact error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
