
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
            .select('id, issue_name, issue_key, status')
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

        // 4. Stores & Deduplication (Batch Processing)
        let newCount = 0;
        let existingCount = 0;

        const existingKeyToId = new Map<string, string>();
        existingIssues?.forEach(i => {
            const key = i.issue_key || normalizeIssueKey(i.issue_name);
            existingKeyToId.set(key, i.id);
        });

        const newIssuesToInsert: any[] = [];
        const issueMap = new Map<string, { issue: typeof extractedIssues[0]; id?: string }>();

        for (const issue of extractedIssues) {
            const key = normalizeIssueKey(issue.issue_name);
            if (existingKeyToId.has(key)) {
                existingCount++;
                issueMap.set(key, { issue, id: existingKeyToId.get(key) });
            } else if (!issueMap.has(key)) {
                newIssuesToInsert.push({
                    canonical_patient_id: patientId,
                    issue_name: issue.issue_name,
                    issue_key: key,
                    status: issue.status,
                    lifecycle_state: 'suggested',
                    evidence_quote: issue.evidence_quote,
                });
                issueMap.set(key, { issue });
            }
        }

        if (newIssuesToInsert.length > 0) {
            const { data: inserted, error: insertError } = await supabase
                .from('patient_issue')
                .insert(newIssuesToInsert)
                .select('id, issue_key');

            if (insertError) {
                console.error('Batch issue insert error', insertError);
            } else if (inserted) {
                newCount = inserted.length;
                for (const ins of inserted) {
                    const entry = issueMap.get(ins.issue_key);
                    if (entry) entry.id = ins.id;
                }
            }
        }

        // Link Sources in batch
        const { data: encounters } = await supabase
            .from('encounter')
            .select('id, encounter_date')
            .eq('canonical_patient_id', patientId);

        const encounterDateMap = new Map((encounters || []).map(e => [e.encounter_date, e.id]));
        const sourcesToUpsert: any[] = [];

        for (const entry of issueMap.values()) {
            const issueId = entry.id;
            if (entry.issue.evidence_quote && issueId) {
                const quoteSnippet = entry.issue.evidence_quote.substring(0, 20);
                const matchedRecord = records.find(r => {
                    const content = r.ai_formatted_transcription || r.letter_draft || r.transcription || '';
                    return content.includes(quoteSnippet);
                });

                if (matchedRecord) {
                    const encId = matchedRecord.consult_date ? encounterDateMap.get(matchedRecord.consult_date) : undefined;
                    sourcesToUpsert.push({
                        patient_issue_id: issueId,
                        encounter_id: encId || null,
                        source_record_id: matchedRecord.id,
                    });
                }
            }
        }

        if (sourcesToUpsert.length > 0) {
            const { error: linkError } = await supabase
                .from('patient_issue_source')
                .upsert(sourcesToUpsert);

            if (linkError) {
                console.error('Batch issue source link error', linkError);
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
