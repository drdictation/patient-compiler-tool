
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isAuthenticated } from '@/lib/auth';
import { extractCuratedIssues, LLMProvider } from '@/lib/llm';

function normalizeIssueKey(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

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
        // 2. Fetch Patient's last extraction timestamp
        const { data: patient } = await supabase
            .from('canonical_patient')
            .select('issues_extracted_at')
            .eq('id', patientId)
            .single();

        const lastExtractedAt = patient?.issues_extracted_at;

        // 3. Fetch ONLY NEW records (since last extraction)
        let query = supabase
            .from('source_record_cache')
            .select('id, consult_date, ai_formatted_transcription, transcription, letter_draft, created_at')
            .eq('canonical_patient_id', patientId)
            .order('consult_date', { ascending: false });

        // If we have a previous extraction, only get records added after that
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

        // 4. Fetch existing issues as context for the LLM
        const { data: existingIssues } = await supabase
            .from('patient_issue')
            .select('issue_name, status')
            .eq('canonical_patient_id', patientId)
            .neq('lifecycle_state', 'rejected');

        // Build context string of existing issues
        let existingContext = "";
        if (existingIssues && existingIssues.length > 0) {
            existingContext = "\n\n--- KNOWN ISSUES (DO NOT DUPLICATE) ---\n";
            existingIssues.forEach(i => {
                existingContext += `- ${i.issue_name} (${i.status})\n`;
            });
            existingContext += "---\nOnly extract NEW issues not already in the list above.\n\n";
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

        // 6. Extract via LLM
        const extractionResult = await extractCuratedIssues({
            text: fullText,
            provider,
            patientId,
            purpose: 'issue_extraction'
        });
        const extractedIssues = extractionResult.issues;

        // 4. Stores & Deduplication
        let newCount = 0;
        let existingCount = 0;

        for (const issue of extractedIssues) {
            const key = normalizeIssueKey(issue.issue_name);

            // A. Insert/Get Patient Issue
            // We use ON CONFLICT to just get ID if exists. 
            // BUT we only update if it's new? 
            // No, if it exists, we stick to existing status unless we want to "re-propose"?
            // Decision: If it exists, we DO NOT override status. We only ensure the issue exists.

            // First, try to find it
            const { data: existingIssue } = await supabase
                .from('patient_issue')
                .select('id')
                .eq('canonical_patient_id', patientId)
                .eq('issue_key', key)
                .single();

            let issueId = existingIssue?.id;

            if (!issueId) {
                // Create new Suggested Issue
                const { data: newIssue, error: insertError } = await supabase
                    .from('patient_issue')
                    .insert({
                        canonical_patient_id: patientId,
                        issue_name: issue.issue_name,
                        issue_key: key,
                        status: issue.status, // Default from LLM, often 'active'
                        lifecycle_state: 'suggested', // Important: Always suggested first
                        evidence_quote: issue.evidence_quote
                    })
                    .select('id')
                    .single();

                if (insertError) {
                    console.error('Issue insert error', insertError);
                    continue;
                }
                issueId = newIssue.id;
                newCount++;
            } else {
                existingCount++;
            }

            // B. Link Sources
            // The LLM gave us a quote, but didn't strictly say WHICH encounter it came from.
            // This is a limitation of batch processing. 
            // We can try to simple-match the quote to the records to find the ID.

            // Heuristic: Find first record containing the quote (or part of it)
            if (issue.evidence_quote && issueId) {
                const quoteSnippet = issue.evidence_quote.substring(0, 20); // First 20 chars
                const matchedRecord = records.find(r => {
                    const content = r.ai_formatted_transcription || r.letter_draft || r.transcription || '';
                    return content.includes(quoteSnippet);
                });

                if (matchedRecord) {
                    const { error: linkError } = await supabase
                        .from('patient_issue_source')
                        .upsert({
                            patient_issue_id: issueId,
                            encounter_id: null, // We might not have encounter_id linked in source_record_cache easily yet? 
                            // Wait, schema says source_record_cache has canonical_patient_id but encounter table also exists.
                            // In sync.ts, we upsert source_record_cache separately from encounter.
                            // However, we can link to source_record_id directly as per our new schema!
                            source_record_id: matchedRecord.id
                            // Note: encounter_id in the join table might be tricky if we don't have it handy.
                            // Let's rely on source_record_id for now as the primary link.
                            // But schema requires encounter_id as part of PK? 
                            // "PRIMARY KEY (patient_issue_id, encounter_id)" -> Wait, I defined it like that?
                            // Let me check my migration file.
                            // "encounter_id UUID REFERENCES encounter(id)"
                            // If I don't have encounter_id easily, I might struggle.
                            // Let's check sync.ts:
                            // We do upsert encounter. Can we map source_record to encounter?
                            // They are linked by date and patient.
                        });

                    // Let's simply fix the schema/logic: ideally link to source_record_id is enough for precision?
                    // But for the Timeline UI, linking to encounter is useful.
                    // For now, I will try to fetch the encounter ID based on date.
                    const { data: enc } = await supabase
                        .from('encounter')
                        .select('id')
                        .eq('canonical_patient_id', patientId)
                        .eq('encounter_date', matchedRecord.consult_date)
                        .single();

                    if (enc) {
                        await supabase.from('patient_issue_source').upsert({
                            patient_issue_id: issueId,
                            encounter_id: enc.id,
                            source_record_id: matchedRecord.id
                        });
                    }
                }
            }
        }

        // 5. Update Extraction Metadata
        await supabase
            .from('canonical_patient')
            .update({ issues_extracted_at: new Date().toISOString() })
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
