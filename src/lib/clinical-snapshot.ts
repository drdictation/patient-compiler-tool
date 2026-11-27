export interface ClinicalSnapshot {
    keySx: string;
    phx: string;
    ix: string;
    medsAndPlan: string;
    updatedAt?: string;
}

export const EMPTY_CLINICAL_SNAPSHOT: ClinicalSnapshot = {
    keySx: '',
    phx: '',
    ix: '',
    medsAndPlan: '',
};

export interface PriorNoteInput {
    id: string;
    encounterDate: string;
    label: string;
    content: string;
}

const HEADING_REGEX = /^(?:#{1,4}\s*|\*\*|__)?([A-Za-z0-9 &/\-()]+?)(?:\*\*|__)?\s*:?\s*$/;

function cleanLines(lines: string[], maxLines: number = 5): string {
    return lines
        .map(l => l.replace(/^\s*[-*•]\s*/, '• ').trim())
        .filter(Boolean)
        .slice(0, maxLines)
        .join('\n');
}

function classifyHeading(heading: string): keyof Omit<ClinicalSnapshot, 'updatedAt'> | null {
    const h = heading.toLowerCase().trim();
    if (/^(past\s+(?:medical|surgical)\s+history|pmhx|phx|background|medical\s+history|co-?morbidities)$/.test(h)) {
        return 'phx';
    }
    if (/^(summary|active\s+issues?|key\s+symptoms?|presenting\s+complaint|history\s+of\s+presenting\s+complaint|hpc|clinical\s+summary|interval\s+history|symptoms?)$/.test(h)) {
        return 'keySx';
    }
    if (/^(investigations?|results?|endoscopy|colonoscopy|gastroscopy|pathology|imaging|bloods|recent\s+results)$/.test(h)) {
        return 'ix';
    }
    if (/^(medications?|current\s+medications?|impression\s*(?:and|&)\s*plan|plan|management|treatment)$/.test(h)) {
        return 'medsAndPlan';
    }
    return null;
}

/**
 * Deterministically parses the most recent prior consult note/letter into the
 * four Clinical Snapshot quadrants (Key Sx, PHx, Ix, Meds & Last Plan).
 * Zero LLM calls, instant 0ms.
 */
export function parseClinicalSnapshotFromNotes(priorNotes: PriorNoteInput[]): ClinicalSnapshot {
    if (!priorNotes || priorNotes.length === 0) {
        return { ...EMPTY_CLINICAL_SNAPSHOT };
    }

    const buckets: Record<keyof Omit<ClinicalSnapshot, 'updatedAt'>, string[]> = {
        keySx: [],
        phx: [],
        ix: [],
        medsAndPlan: [],
    };

    // Scan up to 2 most recent notes so we catch PHx if omitted on a brief follow-up
    const recentNotes = priorNotes.slice(0, 2);

    for (const note of recentNotes) {
        const lines = note.content.split(/\r?\n/);
        let currentBucket: keyof Omit<ClinicalSnapshot, 'updatedAt'> | null = null;

        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;

            // Check inline "Heading: content" format first
            const inlineMatch = trimmed.match(/^(?:\*\*|__)?([A-Za-z][A-Za-z0-9 &/\-]{2,35})(?:\*\*|__)?\s*:\s+(.+)$/);
            if (inlineMatch) {
                const matchedBucket = classifyHeading(inlineMatch[1]);
                if (matchedBucket) {
                    currentBucket = matchedBucket;
                    if (buckets[matchedBucket].length < 5) {
                        buckets[matchedBucket].push(inlineMatch[2].trim());
                    }
                    continue;
                }
            }

            // Check standalone heading line
            const headingMatch = trimmed.match(HEADING_REGEX);
            if (headingMatch && trimmed.length <= 60) {
                const matchedBucket = classifyHeading(headingMatch[1]);
                if (matchedBucket) {
                    currentBucket = matchedBucket;
                    continue;
                } else if (/^#{1,4}\s/.test(trimmed) || /^\*\*[^*]+\*\*:?$/.test(trimmed)) {
                    // Unrelated section heading ends current capture
                    currentBucket = null;
                    continue;
                }
            }

            if (/^(yours\s+sincerely|kind\s+regards|no\s+action\s+required|action\s+required)/i.test(trimmed)) {
                currentBucket = null;
                continue;
            }

            if (currentBucket && buckets[currentBucket].length < 6) {
                buckets[currentBucket].push(trimmed);
            }
        }
    }

    return {
        keySx: cleanLines(buckets.keySx, 5),
        phx: cleanLines(buckets.phx, 5),
        ix: cleanLines(buckets.ix, 5),
        medsAndPlan: cleanLines(buckets.medsAndPlan, 6),
    };
}
