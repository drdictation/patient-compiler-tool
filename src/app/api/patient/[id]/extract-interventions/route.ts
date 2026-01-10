
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAuthenticated } from '@/lib/auth';
import { extractInterventions, LLMProvider } from '@/lib/llm';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // 1. Auth Check
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: patientId } = await params;
    const body = await request.json();
    const provider: LLMProvider = body.provider || 'gemini-flash';

    try {
        // 2. Fetch Patient's last intervention extraction timestamp
        const { data: patient } = await supabase
            .from('canonical_patient')
            .select('interventions_extracted_at')
            .eq('id', patientId)
            .single();

        const lastExtractedAt = patient?.interventions_extracted_at;

        // 3. Fetch ONLY NEW records (since last extraction)
        let query = supabase
            .from('source_record_cache')
            .select('id, consult_date, ai_formatted_transcription, transcription, letter_draft, created_at')
            .eq('canonical_patient_id', patientId)
            .order('consult_date', { ascending: false });

        if (lastExtractedAt) {
            query = query.gt('created_at', lastExtractedAt);
        }

        const { data: records, error: fetchError } = await query;

        if (fetchError || !records) {
            throw new Error('Failed to fetch patient records');
        }

        if (records.length === 0) {
            return NextResponse.json({
                message: lastExtractedAt ? 'No new records since last extraction' : 'No records to process',
                count: 0
            });
        }

        // 4. Fetch existing interventions as context
        const { data: existingInterventions } = await supabase
            .from('patient_intervention')
            .select('intervention_name, intervention_type, response')
            .eq('canonical_patient_id', patientId)
            .neq('lifecycle_state', 'rejected');

        let existingContext = "";
        if (existingInterventions && existingInterventions.length > 0) {
            existingContext = "\n\n--- KNOWN INTERVENTIONS (DO NOT DUPLICATE) ---\n";
            existingInterventions.forEach(i => {
                existingContext += `- ${i.intervention_name} [${i.intervention_type}] - ${i.response}\n`;
            });
            existingContext += "---\nOnly extract NEW interventions not already in the list above.\n\n";
        }

        // 5. Prepare text for LLM (only new records)
        let fullText = existingContext;
        records.forEach(r => {
            const date = r.consult_date || 'Unknown Date';
            const content = r.ai_formatted_transcription || r.letter_draft || r.transcription || '';
            if (content.trim()) {
                fullText += `--- ENCOUNTER DATE: ${date} ---\n${content}\n\n`;
            }
        });

        if (!fullText.trim()) {
            return NextResponse.json({ message: 'No content found in records', count: 0 });
        }

        // 6. Extract via LLM (Interventions)
        const extractionResult = await extractInterventions({
            text: fullText,
            provider
        });
        const extractedItems = extractionResult.interventions;

        // 7. Store Results
        let newCount = 0;
        let existingCount = 0;

        for (const item of extractedItems) {
            // Deduplication: intervention_name (normalized)
            const nameNorm = item.intervention_name.toLowerCase().trim();

            const { data: existing } = await supabase
                .from('patient_intervention')
                .select('id')
                .eq('canonical_patient_id', patientId)
                .ilike('intervention_name', item.intervention_name)
                .maybeSingle();

            if (!existing) {
                // Find source link by date
                let sourceId = null;
                if (item.start_date) {
                    const matchedRecord = records.find(r => r.consult_date === item.start_date);
                    if (matchedRecord) sourceId = matchedRecord.id;
                }

                const { error: insertError } = await supabase
                    .from('patient_intervention')
                    .insert({
                        canonical_patient_id: patientId,
                        intervention_name: item.intervention_name,
                        intervention_type: item.intervention_type,
                        start_date: item.start_date,
                        end_date: item.end_date,
                        response: item.response,
                        response_notes: item.response_notes,
                        source_record_id: sourceId,
                        lifecycle_state: 'suggested'
                    });

                if (!insertError) newCount++;
                else console.error('Insert intervention error', insertError);
            } else {
                existingCount++;
            }
        }

        // 8. Update metadata
        await supabase
            .from('canonical_patient')
            .update({ interventions_extracted_at: new Date().toISOString() })
            .eq('id', patientId);

        return NextResponse.json({
            success: true,
            new: newCount,
            existing: existingCount,
            usage: extractionResult.usage,
            cost: extractionResult.cost
        });

    } catch (e: any) {
        console.error('Error in extract-interventions:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
