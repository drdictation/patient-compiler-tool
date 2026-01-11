
import { supabase } from './supabase';

export type LLMProvider = 'gemini-flash' | 'gemini-flash-lite' | 'gemini-3.0-flash' | 'groq-llama-3' | 'groq-gpt-oss' | 'groq-llama-4';

export interface ExtractedIssue {
    issue_name: string;
    status: 'active' | 'monitoring' | 'resolved';
    evidence_quote: string;
    confidence: 'high' | 'medium' | 'low';
}

export interface ExtractionResult {
    issues: ExtractedIssue[];
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
    cost: number;
}

interface ExtractionOptions {
    text: string;
    provider: LLMProvider;
    patientId?: string;
    purpose?: string;
}

const PRICING = {
    'gemini-flash': { input: 0.15, output: 1.25 }, // Gemini 2.5 Flash
    'gemini-flash-lite': { input: 0.05, output: 0.20 }, // Gemini 2.5 Flash-Lite
    'gemini-3.0-flash': { input: 0.25, output: 1.50 }, // Gemini 3.0 Flash (New)
    'groq-gpt-oss': { input: 0.15, output: 0.60 }, // GPT OSS 120B
    'groq-llama-4': { input: 0.20, output: 0.60 }, // Llama 4 Maverick
    'groq-llama-3': { input: 0.59, output: 0.79 }, // Llama 3 70B (approx standard)
};

function calculateCost(provider: LLMProvider, input: number, output: number): number {
    const rates = PRICING[provider] || { input: 0, output: 0 };
    return ((input * rates.input) + (output * rates.output)) / 1_000_000;
}

// ========== LOGGER UTILITY ==========

interface LLMCallLog {
    provider: string;
    model: string;
    purpose: string;
    patient_id?: string;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    latency_ms: number;
    success: boolean;
    error_message?: string;
}

async function logLLMCall(log: LLMCallLog) {
    try {
        await supabase.from('llm_calls').insert({
            provider: log.provider,
            model: log.model,
            purpose: log.purpose,
            patient_id: log.patient_id,
            tokens_in: log.tokens_in,
            tokens_out: log.tokens_out,
            total_tokens: log.tokens_in + log.tokens_out,
            cost_usd: log.cost_usd,
            latency_ms: log.latency_ms,
            success: log.success,
            error_message: log.error_message
        });
    } catch (e) {
        console.error('Failed to log LLM call:', e);
    }
}

const SYSTEM_PROMPT = `
You are an expert gastroenterologist assistant. 
Review the following patient history extracts and identify the **active, ongoing, or clinically significant** problems.

Focus on:
- Functional GI patterns (e.g., "Chronic bloating", "IBS-D")
- Confirmed diagnoses (e.g., "Crohn's Disease", "Haemochromatosis")
- Active surveillance/monitoring (e.g., "Colon polyp surveillance")

Ignore:
- Transient, resolved minor illnesses (e.g., "Common cold 2 years ago")
- Vague, non-specific symptoms mentioned only once and never again

For each issue, cite the *exact short quote* that best evidences it.

Output JSON only in this format:
[
  { 
    "issue_name": "Chronic bloating", 
    "status": "active", 
    "evidence_quote": "persistent bloating for 3 years", 
    "confidence": "high" 
  }
]
`;

export async function extractCuratedIssues(opts: ExtractionOptions): Promise<ExtractionResult> {
    return await extractGeneric<ExtractionResult>(
        opts.text,
        opts.provider,
        SYSTEM_PROMPT,
        opts.patientId,
        opts.purpose || 'issue_extraction'
    );
}

async function callGemini(
    text: string,
    provider: string,
    systemPrompt: string,
    patientId?: string,
    purpose: string = 'generic'
): Promise<any> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

    let model = 'gemini-2.5-flash';
    if (provider === 'gemini-flash-lite') model = 'gemini-2.5-flash-lite';
    if (provider === 'gemini-3.0-flash') model = 'gemini-2.0-flash'; // 3.0 uses 2.0 endpoint currently

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{
            parts: [{ text: systemPrompt + "\n\nPATIENT TEXT:\n" + text }]
        }],
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    const startTime = Date.now();
    let success = false;
    let errorMessage = undefined;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Gemini API Error: ${res.status} ${err}`);
        }

        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const usage = data.usageMetadata || {};
        inputTokens = usage.promptTokenCount || 0;
        outputTokens = usage.candidatesTokenCount || 0;

        let results: any = [];
        try {
            if (rawText) {
                // Clean markdown code blocks if present
                const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/) || rawText.match(/```([\s\S]*?)```/);
                const cleanText = jsonMatch ? jsonMatch[1] : rawText;
                results = JSON.parse(cleanText);
            }
        } catch (e) {
            console.error('Gemini JSON Parse Error for provider ' + provider, e, 'Raw Text:', rawText);
            // Fallback or empty array, but don't crash
            results = [];
        }

        const items = Array.isArray(results) ? results : ((results as any).issues || (results as any).investigations || (results as any).interventions || []);
        success = true;

        const cost = calculateCost(provider as LLMProvider, inputTokens, outputTokens);

        // Log successful call
        void logLLMCall({
            provider: 'gemini',
            model: model,
            purpose: purpose,
            patient_id: patientId,
            tokens_in: inputTokens,
            tokens_out: outputTokens,
            cost_usd: cost,
            latency_ms: Date.now() - startTime,
            success: true
        });

        return {
            issues: items,
            investigations: items,
            interventions: items,
            tasks: items,
            usage: { input_tokens: inputTokens, output_tokens: outputTokens },
            cost: cost
        };

    } catch (e: any) {
        success = false;
        errorMessage = e.message;

        // Log failed call
        void logLLMCall({
            provider: 'gemini',
            model: model,
            purpose: purpose,
            patient_id: patientId,
            tokens_in: 0,
            tokens_out: 0,
            cost_usd: 0,
            latency_ms: Date.now() - startTime,
            success: false,
            error_message: errorMessage
        });

        throw e;
    }
}

async function callGroq(
    text: string,
    provider: string,
    systemPrompt: string,
    patientId?: string,
    purpose: string = 'generic'
): Promise<any> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('Missing GROQ_API_KEY');

    let model = 'llama3-70b-8192'; // fallback
    if (provider === 'groq-llama-3') model = 'llama3-70b-8192';
    if (provider === 'groq-gpt-oss') model = 'openai/gpt-oss-120b';
    if (provider === 'groq-llama-4') model = 'meta-llama/llama-4-maverick-17b-128e-instruct';

    const startTime = Date.now();
    let success = false;
    let errorMessage = undefined;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                model: model,
                response_format: { type: "json_object" }
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Groq API Error (${model}): ${res.status} ${errText}`);
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        const usage = data.usage || {};
        inputTokens = usage.prompt_tokens || 0;
        outputTokens = usage.completion_tokens || 0;

        const items = await parseGroqResponse(content);
        success = true;

        const cost = calculateCost(provider as LLMProvider, inputTokens, outputTokens);

        // Log success
        void logLLMCall({
            provider: 'groq',
            model: model,
            purpose: purpose,
            patient_id: patientId,
            tokens_in: inputTokens,
            tokens_out: outputTokens,
            cost_usd: cost,
            latency_ms: Date.now() - startTime,
            success: true
        });

        return {
            issues: items,
            investigations: items,
            interventions: items,
            tasks: items,
            usage: { input_tokens: inputTokens, output_tokens: outputTokens },
            cost: cost
        };
    } catch (e: any) {
        success = false;
        errorMessage = e.message;

        void logLLMCall({
            provider: 'groq',
            model: model,
            purpose: purpose,
            patient_id: patientId,
            tokens_in: 0,
            tokens_out: 0,
            cost_usd: 0,
            latency_ms: Date.now() - startTime,
            success: false,
            error_message: errorMessage
        });

        throw e;
    }
}

async function parseGroqResponse(content: string | undefined): Promise<any[]> {
    if (!content) return [];
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return parsed;
        if (parsed.issues && Array.isArray(parsed.issues)) return parsed.issues;
        if (parsed.investigations && Array.isArray(parsed.investigations)) return parsed.investigations;
        if (parsed.interventions && Array.isArray(parsed.interventions)) return parsed.interventions;
        return [];
    } catch (e) {
        console.error('JSON Parse Error', e);
        return [];
    }
}

const INVESTIGATIONS_SYSTEM_PROMPT = `
You are an expert gastroenterologist assistant.
Extract all **investigations, procedures, and significant imaging** from the text.
Also extract any **recall / surveillance** instructions (e.g., "Repeat colonoscopy in 3 years").

Categories to extract:
- **Endoscopy**: Gastroscopy, Colonoscopy, ERCP, EUS, Capsule
- **Imaging**: CT, MRI, Ultrasound, Elastography, X-Ray
- **Pathology**: Only major abnormal results or specific functional tests (Iron studies, Calprotectin). Ignore routine FBC/UEC unless critical.
- **Manometry**: pH studies, HRM

Output JSON format:
[
  {
    "test_name": "Gastroscopy",
    "test_category": "Endoscopy",
    "test_date": "2023-05-12", // Best guess date YYYY-MM-DD or null
    "result_summary": "Small hiatus hernia, otherwise normal",
    "status": "Completed", // or 'Planned' (future) or 'Pending'
    "next_due_date": "2026-05-12", // If "Repeat in 3 years" found. Calculate approximate date.
    "confidence": "high"
  }
]
`;

export interface ExtractedInvestigation {
    test_name: string;
    test_category: 'Endoscopy' | 'Imaging' | 'Pathology' | 'Manometry' | 'Other';
    test_date: string | null;
    result_summary: string;
    status: 'Completed' | 'Planned' | 'Pending';
    next_due_date: string | null;
    confidence: 'high' | 'medium' | 'low';
}

export interface InvestigationExtractionResult {
    investigations: ExtractedInvestigation[];
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
    cost: number;
}

export async function extractInvestigations(opts: ExtractionOptions): Promise<InvestigationExtractionResult> {
    const { text, provider } = opts;
    return await extractGeneric<InvestigationExtractionResult>(
        text,
        provider,
        INVESTIGATIONS_SYSTEM_PROMPT,
        opts.patientId,
        opts.purpose || 'investigation_extraction'
    );
}

// Unified Generic Extractor Helper (Refactored)
async function extractGeneric<T>(
    text: string,
    provider: LLMProvider,
    systemPrompt: string,
    patientId?: string,
    purpose: string = 'generic'
): Promise<T> {
    if (provider.startsWith('gemini')) {
        return await callGemini(text, provider, systemPrompt, patientId, purpose) as T;
    } else if (provider.startsWith('groq')) {
        return await callGroq(text, provider, systemPrompt, patientId, purpose) as T;
    }
    throw new Error(`Unsupported provider: ${provider}`);
}

// ========== INTERVENTIONS ==========

const INTERVENTIONS_SYSTEM_PROMPT = `
You are an expert gastroenterologist assistant.
Extract all **treatments, medications, supplements, and dietary interventions** that have been tried or are currently being used by this patient.

Categories to extract:
- **Medication**: Rifaximin, PPIs (Nexium, Somac), Antispasmodics (Buscopan, Mebeverine), Laxatives, Anti-diarrhoeals
- **Diet**: Low FODMAP, Gluten-free, Dairy-free, High-fiber, Elimination diets
- **Supplement**: Probiotics, Peppermint oil capsules, Iberogast, Fibre supplements (Metamucil, Benefiber)
- **Lifestyle**: Exercise regimen, Stress management, Sleep improvements
- **Procedure**: (Only if therapeutic, not diagnostic) e.g. Botox injection, Balloon dilation

Response/Outcome: Look for phrases indicating effectiveness:
- "helped", "improved", "resolved" -> Effective
- "some improvement", "partial response" -> Partial
- "no improvement", "didn't help", "stopped due to side effects" -> Ineffective
- "ongoing", "currently taking" -> Ongoing
- If no response mentioned -> Unknown

Output JSON format:
[
  {
    "intervention_name": "Rifaximin 550mg TDS x 14 days",
    "intervention_type": "Medication",
    "start_date": "2023-06-01", // Best guess YYYY-MM-DD or null
    "end_date": null, // null if ongoing or unknown
    "response": "Effective", // Effective | Partial | Ineffective | Unknown | Ongoing
    "response_notes": "Bloating significantly improved for 3 months",
    "confidence": "high"
  }
]
`;

export interface ExtractedIntervention {
    intervention_name: string;
    intervention_type: 'Medication' | 'Diet' | 'Supplement' | 'Procedure' | 'Lifestyle' | 'Other';
    start_date: string | null;
    end_date: string | null;
    response: 'Effective' | 'Partial' | 'Ineffective' | 'Unknown' | 'Ongoing';
    response_notes: string | null;
    confidence: 'high' | 'medium' | 'low';
}

export interface InterventionExtractionResult {
    interventions: ExtractedIntervention[];
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
    cost: number;
}


export async function extractInterventions(opts: ExtractionOptions): Promise<InterventionExtractionResult> {
    const { text, provider } = opts;
    return await extractGeneric<InterventionExtractionResult>(
        text,
        provider,
        INTERVENTIONS_SYSTEM_PROMPT,
        opts.patientId,
        opts.purpose || 'intervention_extraction'
    );
}


// ========== SMART NOTE GENERATION ==========

/**
 * Models available for Smart Note generation.
 * Only Gemini 2.5 Flash and Gemini 3.0 Flash are supported.
 */
export type SmartNoteModel = 'gemini-2.5-flash' | 'gemini-3.0-flash' | 'gemini-2.5-flash-lite';

export interface SmartNoteGenerationResult {
    content: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

/**
 * Generate prose content from a transcript using a custom prompt.
 * Unlike extraction functions, this returns text content (not JSON).
 * 
 * @param transcript - The raw transcript text
 * @param patientName - The patient's display name
 * @param prompt - The full prompt with {{TRANSCRIPT}} and {{PATIENT_NAME}} placeholders
 * @param model - The Gemini model to use
 */
export async function generateFromPrompt(
    transcript: string,
    patientName: string,
    prompt: string,
    model: SmartNoteModel,
    patientId?: string,
    purpose: string = 'smart_note'
): Promise<SmartNoteGenerationResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

    // Map friendly names to API model names
    const modelMap: Record<SmartNoteModel, string> = {
        'gemini-2.5-flash': 'gemini-2.5-flash',
        'gemini-3.0-flash': 'gemini-2.0-flash',  // Note: 3.0 Flash uses 2.0-flash endpoint
        'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite'
    };

    const apiModel = modelMap[model];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;

    // Replace placeholders with actual values
    const fullPrompt = prompt
        .replace('{{PATIENT_NAME}}', patientName)
        .replace('{{TRANSCRIPT}}', transcript);

    const body = {
        contents: [{
            parts: [{ text: fullPrompt }]
        }],
        generationConfig: {
            // Use text output (not JSON) for prose generation
            maxOutputTokens: 8192
        }
    };

    const startTime = Date.now();
    let success = false;
    let errorMessage = undefined;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Gemini API Error: ${res.status} ${err}`);
        }

        const data = await res.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const usage = data.usageMetadata || {};
        inputTokens = usage.promptTokenCount || 0;
        outputTokens = usage.candidatesTokenCount || 0;

        success = true;

        let providerKey: LLMProvider = 'gemini-flash';
        if (model === 'gemini-2.5-flash-lite') providerKey = 'gemini-flash-lite';
        if (model === 'gemini-3.0-flash') providerKey = 'gemini-3.0-flash';

        const cost = calculateCost(providerKey, inputTokens, outputTokens);

        void logLLMCall({
            provider: 'gemini',
            model: apiModel,
            purpose: purpose,
            patient_id: patientId,
            tokens_in: inputTokens,
            tokens_out: outputTokens,
            cost_usd: cost,
            latency_ms: Date.now() - startTime,
            success: true
        });

        return {
            content,
            usage: {
                input_tokens: inputTokens,
                output_tokens: outputTokens
            }
        };

    } catch (e: any) {
        success = false;
        errorMessage = e.message;

        void logLLMCall({
            provider: 'gemini',
            model: apiModel,
            purpose: purpose,
            patient_id: patientId,
            tokens_in: 0,
            tokens_out: 0,
            cost_usd: 0,
            latency_ms: Date.now() - startTime,
            success: false,
            error_message: errorMessage
        });

        throw e;
    }
}

// ========== TASK EXTRACTION ==========

/**
 * Represents a single extracted task from a transcript.
 */
export interface ExtractedTask {
    task_description: string;
    task_category: 'clinical' | 'administrative' | 'follow_up';
    evidence_quote: string;
    confidence: 'high' | 'medium' | 'low';
}

/**
 * Result of task extraction including usage metrics.
 */
export interface TaskExtractionResult {
    tasks: ExtractedTask[];
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
    cost: number;
}

/**
 * Extract actionable tasks from a consultation transcript.
 * Uses the TASK_EXTRACTION_PROMPT to identify clinical, administrative, and follow-up tasks.
 * 
 * @param transcript - The raw transcript text
 * @param patientName - The patient's display name
 * @param model - The Gemini model to use
 * @param patientId - Optional patient ID for logging
 */
export async function extractTasks(
    transcript: string,
    patientName: string,
    provider: LLMProvider, // Changed from SmartNoteModel to LLMProvider
    patientId?: string
): Promise<TaskExtractionResult> {
    // Import prompt dynamically
    const { TASK_EXTRACTION_PROMPT } = await import('./prompts');

    // Remove the footer from the prompt if it exists (for using with extractGeneric)
    // We want just the system instructions part
    const systemInstructions = TASK_EXTRACTION_PROMPT.split('# Input Transcript')[0].trim();

    // Prepare text with patient context
    const textContext = `PATIENT NAME: ${patientName}\n\nTRANSCRIPT:\n${transcript}`;

    // Use the generic extractor which supports both Gemini and Groq
    const result = await extractGeneric<any>( // extracting 'any' first because extractGeneric returns array/object directly
        textContext,
        provider,
        systemInstructions,
        patientId,
        'task_extraction'
    );

    // Normalize result to TaskExtractionResult
    // extractGeneric returns the parsed JSON object/array
    // Note: extractGeneric -> callGroq/callGemini returns { items: [], usage: {}, cost: {} } format or just array?
    // Wait, callGemini/callGroq return { issues: items, investigations: items ... } wrapper.
    // I need to update callGemini/callGroq to also include 'tasks' key or rely on 'items' being reusable.
    // Actually, callGemini/callGroq returns an object with keys tailored for existing functions.
    // I need to update callGemini/callGroq FIRST or handle the return object here.

    // It seems callGeneric returns T, which is the return type of callGemini/callGroq.
    // callGemini returns: { issues: items, investigations: items, interventions: items, usage, cost }
    // I need to extract 'tasks' from this. Since 'items' is the parsed array, I can use issues/investigations/interventions property which all point to 'items'.

    const items = (result as any).issues || []; // 'issues' contains the raw items array

    return {
        tasks: items,
        usage: result.usage,
        cost: result.cost
    };
}
