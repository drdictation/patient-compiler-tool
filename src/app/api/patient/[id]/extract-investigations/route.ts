
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAuthenticated } from '@/lib/auth';
import { extractInvestigations, LLMProvider } from '@/lib/llm';

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
        // 2. Fetch Patient's last investigation extraction timestamp
        const { data: patient } = await supabase
            .from('canonical_patient')
            .select('investigations_extracted_at')
            .eq('id', patientId)
            .single();

        const lastExtractedAt = patient?.investigations_extracted_at;

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

        // 4. Fetch existing investigations as context
        const { data: existingInvestigations } = await supabase
            .from('patient_investigation')
            .select('test_name, test_date, test_category')
            .eq('canonical_patient_id', patientId)
            .neq('lifecycle_state', 'rejected');

        let existingContext = "";
        if (existingInvestigations && existingInvestigations.length > 0) {
            existingContext = "\n\n--- KNOWN INVESTIGATIONS (DO NOT DUPLICATE) ---\n";
            existingInvestigations.forEach(i => {
                existingContext += `- ${i.test_name} (${i.test_date || 'no date'}) [${i.test_category}]\n`;
            });
            existingContext += "---\nOnly extract NEW investigations not already in the list above.\n\n";
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

        // 6. Extract via LLM (Investigations)
        const extractionResult = await extractInvestigations({
            text: fullText,
            provider,
            patientId,
            purpose: 'investigation_extraction'
        });
        const extractedTests = extractionResult.investigations;

        // 4. Store Results (Batch Processing)
        let newCount = 0;
        let existingCount = 0;

        const existingSet = new Set<string>();
        existingInvestigations?.forEach(i => {
            const normName = i.test_name.toLowerCase().trim();
            const dateKey = i.test_date || 'no-date';
            existingSet.add(`${normName}|${dateKey}`);
        });

        const newInvestigationsToInsert: any[] = [];

        for (const test of extractedTests) {
            const normName = test.test_name.toLowerCase().trim();
            const dateKey = test.test_date || 'no-date';
            const key = `${normName}|${dateKey}`;

            if (existingSet.has(key)) {
                existingCount++;
            } else {
                existingSet.add(key); // avoid duplicates within the same batch
                let sourceId = null;
                if (test.test_date) {
                    const matchedRecord = records.find(r => r.consult_date === test.test_date);
                    if (matchedRecord) sourceId = matchedRecord.id;
                }

                newInvestigationsToInsert.push({
                    canonical_patient_id: patientId,
                    test_name: test.test_name,
                    test_category: test.test_category,
                    test_date: test.test_date,
                    result_summary: test.result_summary,
                    status: test.status,
                    next_due_date: test.next_due_date,
                    source_record_id: sourceId,
                    lifecycle_state: 'suggested'
                });
            }
        }

        if (newInvestigationsToInsert.length > 0) {
            const { data: inserted, error: insertError } = await supabase
                .from('patient_investigation')
                .insert(newInvestigationsToInsert)
                .select('id');

            if (insertError) {
                console.error('Batch insert investigation error', insertError);
            } else if (inserted) {
                newCount = inserted.length;
            }
        }

        // Update metadata
        await supabase
            .from('canonical_patient')
            .update({ investigations_extracted_at: new Date().toISOString() })
            .eq('id', patientId);

        return NextResponse.json({
            success: true,
            new: newCount,
            existing: existingCount,
            usage: extractionResult.usage,
            cost: extractionResult.cost
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
