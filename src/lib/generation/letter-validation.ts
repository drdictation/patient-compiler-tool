import { SmartNoteGenerationResult } from '../llm';

export interface LetterValidationInput {
    text: string;
    authoritativePatientName: string;
    transcript: string;
    letterType: string;
    templateType: string;
    metadata?: SmartNoteGenerationResult;
    expectedPronouns?: 'he' | 'she' | 'they' | string;
}

export interface LetterValidationResult {
    valid: boolean;
    fatalErrors: string[];
    warnings: string[];
}

const EXAMPLE_NAMES = [
    'John Doe',
    'Jane Smith',
    'Sarah Jenkins',
    'Robert Johnson',
    'Sarah',
    'Jenkins',
    'Robert',
    'Johnson'
];

/**
 * Validates a generated letter against fatal clinical safety and formatting rules,
 * returning any fatal errors and clinician warnings.
 */
export function validateGeneratedLetter(input: LetterValidationInput): LetterValidationResult {
    const fatalErrors: string[] = [];
    const warnings: string[] = [];
    const text = input.text || '';
    const trimmedText = text.trim();
    const patientNameLower = input.authoritativePatientName.toLowerCase();
    const transcriptLower = input.transcript.toLowerCase();

    // ----------------------------------------------------
    // FATAL RULES
    // ----------------------------------------------------

    // 1. Empty or below a conservative minimum length
    if (trimmedText.length < 150) {
        fatalErrors.push('Letter is empty or too short (minimum 150 characters).');
    }

    // 2. Non-normal finish reason, blocked response, or missing candidate
    if (input.metadata) {
        if (input.metadata.blocked) {
            fatalErrors.push(`Generation was blocked by the provider: ${input.metadata.blockReason || 'Unknown safety reason'}`);
        }
        if (input.metadata.finishReason && input.metadata.finishReason !== 'STOP' && input.metadata.finishReason !== 'UNKNOWN') {
            fatalErrors.push(`Incomplete generation: provider reported finish reason as "${input.metadata.finishReason}"`);
        }
    }

    // 3. Unresolved template placeholders matching {{...}}
    if (/\{\{[A-Za-z0-9_\s\-]+\}\}/.test(text)) {
        fatalErrors.push('Unresolved template placeholders matching {{placeholder}} detected.');
    }

    // 4. Scaffold placeholders
    const scaffoldPatterns = [
        /\[Insert/i,
        /\[Key diagnosis/i,
        /\[Body Paragraphs/i,
        /\[Patient/i,
        /\[Insert Line Break\]/i,
        /\[Dr/i,
        /\[Doctor/i,
        /\[Clinic/i
    ];
    for (const pattern of scaffoldPatterns) {
        if (pattern.test(text)) {
            fatalErrors.push(`Scaffold placeholder matching "${pattern.source}" detected.`);
            break;
        }
    }

    // 5. Markdown code fences or leading model commentary
    if (trimmedText.startsWith('```') || text.includes('```')) {
        fatalErrors.push('Markdown code fences (```) detected in the letter content.');
    }
    const commentaryPatterns = [
        /^Here is the letter/i,
        /^Here's the letter/i,
        /^Sure, here is/i,
        /^Certainly, here is/i
    ];
    if (commentaryPatterns.some(pattern => pattern.test(trimmedText))) {
        fatalErrors.push('Leading conversational model commentary detected (e.g. "Here is the letter").');
    }

    // 6. Section checks: Summary and Impression/Plan
    const summaryRegex = /^(?:#|##|\*\*|__)?\s*Summary\b/mi;
    const impressionRegex = /^(?:#|##|\*\*|__)?\s*Impression\s*(?:and|&)\s*Plan\b/mi;

    const summaryMatches = text.match(new RegExp(summaryRegex.source, 'gmi')) || [];
    const impressionMatches = text.match(new RegExp(impressionRegex.source, 'gmi')) || [];

    if (summaryMatches.length === 0) {
        fatalErrors.push('Required heading "Summary" is missing.');
    } else if (summaryMatches.length > 1) {
        fatalErrors.push('Duplicate "Summary" headings detected.');
    }

    if (impressionMatches.length === 0) {
        fatalErrors.push('Required heading "Impression and Plan" is missing.');
    } else if (impressionMatches.length > 1) {
        fatalErrors.push('Duplicate "Impression and Plan" headings detected.');
    }

    // 7. No body prose between Summary and Impression/Plan
    if (summaryMatches.length === 1 && impressionMatches.length === 1) {
        const summaryIndex = text.search(summaryRegex);
        const impressionIndex = text.search(impressionRegex);
        if (summaryIndex < impressionIndex) {
            // Find text after Summary heading up to Impression and Plan
            const summaryHeadingMatch = text.match(summaryRegex);
            const headingLength = summaryHeadingMatch ? summaryHeadingMatch[0].length : 0;
            const bodyBetween = text.substring(summaryIndex + headingLength, impressionIndex).trim();
            // Filter out characters that are just headers, linebreaks, or markdown formatting
            const cleanedBody = bodyBetween.replace(/[#\*_\-\s\n\r]/g, '');
            if (cleanedBody.length < 20) {
                fatalErrors.push('No substantial body prose found between Summary and Impression/Plan sections.');
            }
        } else {
            fatalErrors.push('"Summary" must appear before "Impression and Plan".');
        }
    }

    // 8. Example patient name leakage
    for (const name of EXAMPLE_NAMES) {
        const regex = new RegExp(`\\b${name}\\b`, 'i');
        if (regex.test(text)) {
            // Only alert if this name is NOT part of the patient's real name AND NOT in transcript
            const nameLower = name.toLowerCase();
            const matchesPatient = patientNameLower.includes(nameLower);
            const matchesTranscript = transcriptLower.includes(nameLower);
            if (!matchesPatient && !matchesTranscript) {
                fatalErrors.push(`Example patient name leakage detected ("${name}").`);
                break;
            }
        }
    }

    // 9. GP action conflicts: "No action required" vs "Action required"
    const hasNoAction = /no\s+action\s+required/i.test(text) || /no\s+further\s+action\s+is\s+required/i.test(text);
    const hasActionRequired = /action\s+required/i.test(text) || /action\s+requested/i.test(text);
    if (hasNoAction && hasActionRequired) {
        fatalErrors.push('Conflicting GP action statements detected: contains both "action required" and "no action required".');
    }

    // 10. Different patient name detected in patient salutation
    // Checks for lines like "Dear Mr. Smith," or "Dear Jane,"
    const salutationRegex = /^Dear\s+(?:Mr\.|Ms\.|Mrs\.|Miss)?\s*([A-Z][a-z]+)/m;
    const salutationMatch = text.match(salutationRegex);
    if (salutationMatch) {
        const salutationName = salutationMatch[1].toLowerCase();
        // Ignore common clinician salutations like "Dr" or "Doctor" or "Registrar"
        const isClinician = /dr|doctor|registrar|colleague|physician/i.test(salutationMatch[0]);
        if (!isClinician) {
            const matchesPatient = patientNameLower.includes(salutationName);
            const matchesTranscript = transcriptLower.includes(salutationName);
            if (!matchesPatient && !matchesTranscript) {
                fatalErrors.push(`Incorrect patient name detected in salutation ("${salutationMatch[1]}").`);
            }
        }
    }

    // ----------------------------------------------------
    // WARNING RULES
    // ----------------------------------------------------

    // 1. Missing closing sign-off statement
    const hasSignOff = /kind\s+regards/i.test(text) ||
                       /yours\s+sincerely/i.test(text) ||
                       /regards/i.test(text) ||
                       /sincerely/i.test(text) ||
                       /yours\s+faithfully/i.test(text) ||
                       /best\s+regards/i.test(text);
    if (!hasSignOff) {
        warnings.push('No standard closing sign-off found (e.g., "Kind regards", "Yours sincerely").');
    }

    // 2. Unusually long output relative to transcript (ratio > 3.0 and transcript > 300 chars)
    if (input.transcript.length > 300) {
        const ratio = text.length / input.transcript.length;
        if (ratio > 3.0) {
            warnings.push(`Letter length is unusually long relative to transcript (ratio ${ratio.toFixed(1)}x).`);
        }
    }

    // 3. GP action statement without a clear transcript anchor
    // If we have an action statement, check if words like "action", "gp", "request", "require" appear in the transcript
    if (hasActionRequired) {
        const hasTranscriptAnchor = /gp|action|request|require|please|refer|follow\s*up/i.test(input.transcript);
        if (!hasTranscriptAnchor) {
            warnings.push('GP Action requested in letter, but no corresponding action keywords found in transcript.');
        }
    }

    // 4. Examination statement when the transcript contains no examination language
    const hasExamText = /examination\s+revealed/i.test(text) ||
                        /on\s+examination/i.test(text) ||
                        /chest\s+was\s+clear/i.test(text) ||
                        /blood\s+pressure\s+was/i.test(text) ||
                        /heart\s+rate\s+was/i.test(text) ||
                        /pulse\s+was/i.test(text);
    if (hasExamText) {
        const hasExamTranscript = /examine|examination|bp|pressure|pulse|bpm|heart|chest|clear|revealed/i.test(input.transcript);
        if (!hasExamTranscript) {
            warnings.push('Physical examination findings mentioned in letter, but transcript contains no examination terminology.');
        }
    }

    // 5. Pronoun inconsistency when explicit pronouns were selected
    if (input.expectedPronouns) {
        const pronounsLower = input.expectedPronouns.toLowerCase();
        if (pronounsLower === 'he' || pronounsLower === 'him' || pronounsLower === 'his') {
            // Count female pronouns
            const femalePronounCount = (text.match(/\b(she|her|hers)\b/gi) || []).length;
            if (femalePronounCount > 2) {
                warnings.push(`Inconsistent pronouns: expected male pronouns but found ${femalePronounCount} female pronouns.`);
            }
        } else if (pronounsLower === 'she' || pronounsLower === 'her' || pronounsLower === 'hers') {
            // Count male pronouns
            const malePronounCount = (text.match(/\b(he|him|his)\b/gi) || []).length;
            if (malePronounCount > 2) {
                warnings.push(`Inconsistent pronouns: expected female pronouns but found ${malePronounCount} male pronouns.`);
            }
        }
    }

    // 6. Excessive bullets outside Summary
    // Count total bullets starting with - or * or numbers
    const parts = text.split(summaryRegex);
    if (parts.length > 1) {
        // Look at the part after Summary, but split by Impression/Plan to get text outside Summary
        const afterSummary = parts[1];
        const postSummaryParts = afterSummary.split(impressionRegex);
        // Bullet points are mostly found in the Impression & Plan section if they are outside Summary
        const outsideSummaryText = postSummaryParts.join('\n');
        const bulletCount = (outsideSummaryText.match(/^\s*[\-\*\u2022]\s/gm) || []).length;
        if (bulletCount > 8) {
            warnings.push(`Excessive number of bullet points (${bulletCount}) outside the Summary section.`);
        }
    }

    return {
        valid: fatalErrors.length === 0,
        fatalErrors,
        warnings
    };
}
