
import { supabase } from './supabase';
import { fetchBridgeRecords, BridgeRecord } from './bridge';

// Helper to normalize patient names (Key for identity resolution)
function normalizeName(name: string): string {
    if (!name) return 'unknown';
    // Lowercase, remove special chars except spaces, collapse spaces
    return name.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Syncs new records from Heroku Bridge to Supabase Overlay.
 * 1. Gets last synced ID from watermark
 * 2. Fetches new records from Bridge
 * 3. Upserts CanonicalPatients (if new)
 * 4. Upserts Encounters
 * 5. Upserts SourceRecordCache
 * 6. Updates watermark
 */
export async function syncRecords() {
    // 1. Get last watermark
    const { data: watermarkData, error: watermarkError } = await supabase
        .from('sync_watermark')
        .select('last_heroku_id')
        .eq('id', 1)
        .single();

    if (watermarkError && watermarkError.code !== 'PGRST116') {
        throw new Error(`Failed to fetch watermark: ${watermarkError.message}`);
    }

    let lastId = watermarkData?.last_heroku_id || 0;
    console.log(`Starting sync from ID: ${lastId}`);

    let totalSynced = 0;
    let keepFetching = true;
    let loops = 0;
    const BATCH_SIZE = 50;
    const MAX_LOOPS = 10; // Safety limit: 500 records per click to prevent timeout

    while (keepFetching && loops < MAX_LOOPS) {
        loops++;
        console.log(`Sync Batch ${loops} (Cursor: ${lastId})`);

        // 2. Fetch from Bridge
        const bridgeResponse = await fetchBridgeRecords(lastId, BATCH_SIZE);
        const records = bridgeResponse.records;

        if (records.length === 0) {
            console.log('No new records found.');
            keepFetching = false;
            break;
        }

        console.log(`Fetched ${records.length} records. Processing...`);

        let maxIdInBatch = lastId;

        // 3. Process each record
        for (const record of records) {
            try {
                // A. Normalize Name & Identity
                const normalized = normalizeName(record.patient_name);
                const displayName = record.patient_name || 'Unknown Patient';
                const consultDate = record.consult_date;

                // B. Upsert Canonical Patient
                const { data: patientData, error: patientError } = await supabase
                    .from('canonical_patient')
                    .upsert(
                        {
                            normalized_name: normalized,
                            display_name: displayName,
                            external_patient_id: record.patient_id,
                            date_of_birth: record.date_of_birth,
                            updated_at: new Date().toISOString()
                        },
                        { onConflict: 'normalized_name' }
                    )
                    .select('id')
                    .single();

                if (patientError) throw new Error(`Patient Upsert Error: ${patientError.message}`);
                const patientId = patientData.id;

                // C. Upsert Encounter
                if (consultDate) {
                    const { error: encounterError } = await supabase
                        .from('encounter')
                        .upsert(
                            {
                                canonical_patient_id: patientId,
                                encounter_date: consultDate,
                                updated_at: new Date().toISOString()
                            },
                            { onConflict: 'canonical_patient_id, encounter_date' }
                        );

                    if (encounterError) throw new Error(`Encounter Upsert Error: ${encounterError.message}`);
                }

                // D. Upsert Source Record Cache
                const { error: cacheError } = await supabase
                    .from('source_record_cache')
                    .upsert(
                        {
                            heroku_id: record.id,
                            canonical_patient_id: patientId,
                            patient_name_raw: record.patient_name,
                            patient_id_raw: record.patient_id,
                            date_of_birth: record.date_of_birth,
                            consult_date: record.consult_date,
                            transcription: record.transcription,
                            ai_formatted_transcription: record.ai_formatted_transcription,
                            letter_draft: record.letter_draft,
                            status: record.status,
                            created_at_heroku: record.created_at,
                            synced_at: new Date().toISOString()
                        },
                        { onConflict: 'heroku_id' }
                    );

                if (cacheError) throw new Error(`Cache Upsert Error: ${cacheError.message}`);

                maxIdInBatch = Math.max(maxIdInBatch, record.id);

            } catch (err) {
                console.error(`Failed to process record ${record.id}:`, err);
            }
        }

        // 4. Update Watermark after each batch (for safety)
        if (maxIdInBatch > lastId) {
            const { error: updateError } = await supabase
                .from('sync_watermark')
                .upsert({ id: 1, last_heroku_id: maxIdInBatch, last_sync_at: new Date().toISOString() });

            if (updateError) console.error('Failed to update watermark:', updateError);
            lastId = maxIdInBatch; // Move cursor forward for next loop
        }

        totalSynced += records.length;

        // Stop if we fetched fewer than batch size (end of stream)
        if (records.length < BATCH_SIZE) {
            keepFetching = false;
        }
    }

    return { count: totalSynced, lastId: lastId };
}
