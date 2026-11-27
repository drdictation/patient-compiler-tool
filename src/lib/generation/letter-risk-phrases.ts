export type RiskPhraseCategory =
    | 'meta_omission'
    | 'transcript_meta'
    | 'no_exam_boilerplate'
    | 'placeholder_leak'
    | 'ai_chatter';

export interface RiskPhraseRule {
    id: string;
    category: RiskPhraseCategory;
    label: string;
    pattern: RegExp;
    /** Optional sentence-level guard; return true to suppress a match (e.g. telehealth exam). */
    ignoreIfSentenceMatches?: RegExp;
}

export interface RiskPhraseMatch {
    ruleId: string;
    category: RiskPhraseCategory;
    label: string;
    matchedText: string;
    startIndex: number;
    endIndex: number;
    snippet: string;
}

export const RISK_PHRASE_RULES: RiskPhraseRule[] = [
    {
        id: 'meta_omission_not_recorded',
        category: 'meta_omission',
        label: 'Meta-commentary about unrecorded/missing information',
        pattern: /\b(?:(?:the|this|exact|further|specific|full|complete|her|his|their)\s+)?(?:information|details?|history|doses?|dosage|frequency|duration|timing|regimen|regime|medications?|allergies|results?|report|nature|extent|dates?)\s+(?:was|were|is|are)\s+not\s+(?:recorded|documented|mentioned|discussed|specified|stated|captured|detailed|elicited|addressed|covered|established(?:\s+clearly)?|clarified|confirmed|provided|available|known|clear|reviewed|obtained|noted)\b/gi,
    },
    {
        id: 'meta_omission_no_list_reviewed',
        category: 'meta_omission',
        label: 'Meta-commentary about unreviewed medications or missing notes',
        pattern: /\bno\s+(?:medication\s+list|medications?|allergies|details?|information|history|record|documentation|doses?|dosage)\s+(?:was|were|is|are)\s+(?:reviewed|recorded|documented|mentioned|discussed|provided|available|elicited|captured|established|obtained)\b/gi,
    },
    {
        id: 'meta_omission_in_consultation',
        category: 'meta_omission',
        label: 'References missing details "in/during the consultation"',
        pattern: /\b(?:not\s+(?:recorded|documented|captured|elicited|mentioned|discussed|established|clarified|available)|wasn't\s+(?:recorded|documented|mentioned|discussed)|were\s+not\s+(?:recorded|documented|mentioned|discussed))\s+(?:in|during|at|from)\s+(?:the|this|our)\s+(?:consultation|discussion|conversation|review|visit|appointment|notes|transcript|recording)\b/gi,
    },
    {
        id: 'meta_omission_cannot_determine',
        category: 'meta_omission',
        label: 'States details could not be determined from consultation',
        pattern: /\b(?:could\s+not|cannot|unable\s+to)\s+(?:be\s+)?(?:determined|confirmed|established|clarified|ascertained)\s+(?:from|in|during)\s+(?:the|this|our)\s+(?:consultation|discussion|conversation|transcript|recording|notes)\b/gi,
    },
    {
        id: 'meta_omission_agent_or_weight_unknown',
        category: 'meta_omission',
        label: 'States specific agent, dose, or detail was not clear/known',
        pattern: /\b(?:(?:the\s+)?(?:agent\s+injected|exact\s+\w+|current\s+weight|nature\s+of\s+(?:this|these)(?:\s+\w+)?|doses?|dosage|frequency|duration\s+of\s+treatment)\s+(?:was|were|is|are)\s+not\s+(?:clear|known|established(?:\s+clearly)?|clarified|specified)|(?:was|were)\s+not\s+established\s+clearly)\b/gi,
    },
    {
        id: 'transcript_meta_unclear_from_discussion',
        category: 'transcript_meta',
        label: 'Meta-reference to clarity "from our discussion" / "at this consultation"',
        pattern: /\b(?:not\s+(?:clear|established|available|known|reviewed|recorded|documented)|unclear)\s+(?:from|in|during|at)\s+(?:our|this|the)\s+(?:discussion|consultation|conversation|transcript|recording|notes)\b/gi,
    },
    {
        id: 'transcript_meta_direct_ref',
        category: 'transcript_meta',
        label: 'Direct reference to transcript, dictation, or audio recording',
        pattern: /\b(?:(?:as\s+per|based\s+on|according\s+to|from|in)\s+(?:the|this)\s+(?:transcript|dictation|audio(?:\s+recording)?|voice\s+recording)|(?:transcript|dictation)\s+(?:does\s+not|did\s+not|shows|states|notes))\b/gi,
    },
    {
        id: 'no_exam_boilerplate',
        category: 'no_exam_boilerplate',
        label: 'Standalone "no physical examination performed" boilerplate',
        pattern: /\b(?:(?:a\s+formal\s+|physical\s+)?examination\s+was\s+not\s+(?:undertaken|performed|conducted|carried\s+out)|I\s+did\s+not\s+(?:perform|undertake|conduct)\s+(?:a\s+)?(?:formal\s+)?(?:physical\s+)?examination|no\s+(?:formal\s+)?physical\s+examination\s+was\s+(?:performed|undertaken|conducted))\b/gi,
        ignoreIfSentenceMatches: /\b(?:telehealth|telephone|phone|video|virtual|remote)\b/i,
    },
    {
        id: 'placeholder_leak_brackets',
        category: 'placeholder_leak',
        label: 'Unresolved template or bracket placeholder',
        pattern: /(?:\{\{[^}\n]{1,60}\}\}|\[(?:Insert|TBC|TBD|Patient|Doctor|Dr|Clinic|Date|Dose|Medication|Name|Key\s+diagnosis|Body\s+Paragraphs|Placeholder)[^\]\n]{0,60}\]|\b(?:TBD|TBC|PLACEHOLDER)\b)/gi,
    },
    {
        id: 'placeholder_leak_inaudible',
        category: 'placeholder_leak',
        label: 'Unresolved audio marker (inaudible / unintelligible)',
        pattern: /\b(?:inaudible|unintelligible)\b/gi,
    },
    {
        id: 'ai_chatter',
        category: 'ai_chatter',
        label: 'AI meta-commentary leakage',
        pattern: /(?:^(?:Here\s+is\s+the\s+letter|Here's\s+the\s+letter|Sure,\s+here\s+is|Certainly,\s+here\s+is)\b|\b(?:as\s+an\s+AI|based\s+on\s+the\s+provided\s+(?:transcript|text|information))\b)/gim,
    },
];

function getEnclosingSentence(text: string, startIndex: number, endIndex: number): string {
    const before = text.slice(0, startIndex);
    const after = text.slice(endIndex);

    const prevBreak = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'));
    const nextCandidates = [after.indexOf('\n'), after.indexOf('.'), after.indexOf('!'), after.indexOf('?')].filter(i => i >= 0);
    const nextBreak = nextCandidates.length > 0 ? Math.min(...nextCandidates) : after.length;

    const sentStart = prevBreak >= 0 ? prevBreak + 1 : 0;
    const sentEnd = endIndex + nextBreak;
    return text.slice(sentStart, sentEnd).trim();
}

function buildSnippet(text: string, startIndex: number, endIndex: number): string {
    const sentence = getEnclosingSentence(text, startIndex, endIndex);
    if (sentence.length > 0 && sentence.length <= 180) {
        return sentence;
    }
    const ctxStart = Math.max(0, startIndex - 45);
    const ctxEnd = Math.min(text.length, endIndex + 45);
    const prefix = ctxStart > 0 ? '…' : '';
    const suffix = ctxEnd < text.length ? '…' : '';
    return `${prefix}${text.slice(ctxStart, ctxEnd).replace(/\s+/g, ' ').trim()}${suffix}`;
}

/**
 * Scans a generated or edited referrer letter for awkward AI meta-omissions,
 * transcript references, placeholder leaks, or unnecessary boilerplate.
 * Overlapping matches are merged/deduplicated so spans stay strictly non-overlapping.
 */
export function scanLetterRiskPhrases(text?: string | null): RiskPhraseMatch[] {
    if (!text || !text.trim()) return [];

    const rawMatches: RiskPhraseMatch[] = [];

    for (const rule of RISK_PHRASE_RULES) {
        const rx = new RegExp(rule.pattern.source, rule.pattern.flags);
        let match: RegExpExecArray | null;
        while ((match = rx.exec(text)) !== null) {
            const matchedText = match[0];
            if (!matchedText) {
                rx.lastIndex++;
                continue;
            }
            const startIndex = match.index;
            const endIndex = startIndex + matchedText.length;

            if (rule.ignoreIfSentenceMatches) {
                const sentence = getEnclosingSentence(text, startIndex, endIndex);
                if (rule.ignoreIfSentenceMatches.test(sentence)) {
                    continue;
                }
            }

            rawMatches.push({
                ruleId: rule.id,
                category: rule.category,
                label: rule.label,
                matchedText,
                startIndex,
                endIndex,
                snippet: buildSnippet(text, startIndex, endIndex),
            });
        }
    }

    if (rawMatches.length === 0) return [];

    // Sort by startIndex ascending, longest span first on ties
    rawMatches.sort((a, b) => a.startIndex - b.startIndex || (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex));

    const deduped: RiskPhraseMatch[] = [];
    for (const m of rawMatches) {
        const last = deduped[deduped.length - 1];
        if (last && m.startIndex < last.endIndex) {
            // Overlapping match: keep the wider span
            if (m.endIndex > last.endIndex) {
                last.endIndex = m.endIndex;
                last.matchedText = text.slice(last.startIndex, last.endIndex);
                last.snippet = buildSnippet(text, last.startIndex, last.endIndex);
            }
            continue;
        }
        deduped.push(m);
    }

    return deduped;
}

export function hasLetterRiskPhrases(text?: string | null): boolean {
    return scanLetterRiskPhrases(text).length > 0;
}
