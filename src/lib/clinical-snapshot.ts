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

export interface SlicedSectionEntry {
    id: string;
    encounterDate: string;
    formattedDate: string;
    sourceLabel: string;
    content: string;
}

export interface SlicedClinicalHistory {
    issues: SlicedSectionEntry[];
    phxMeds: SlicedSectionEntry[];
    ixTrials: SlicedSectionEntry[];
    plans: SlicedSectionEntry[];
}

type BucketKey = keyof SlicedClinicalHistory;
type HeadingTarget = BucketKey | 'ignore' | null;

const HEADING_LINE_RX = /^(?:#{1,4}\s+(.+?)\s*|\*\*([^*]+?)\*\*:?\s*|__([^_]+?)__:?\s*|([A-Z][A-Za-z0-9 &/\-()]{2,50}):\s*)$/;
const SIGN_OFF_STOP_RX = /^(?:yours\s+sincerely|yours\s+faithfully|kind\s+regards|best\s+regards|warm\s+regards|no\s+action\s+required|action\s+required|action\s+requested)\b/i;

function classifyTopLevelHeading(rawHeading: string): HeadingTarget {
    const h = rawHeading
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[:*#]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (/^(?:current\s+issues?|issues?|interval\s+history|summary|active\s+issues?|presenting\s+complaint|history\s+of\s+presenting\s+complaint|hpc|clinical\s+summary)$/.test(h)) {
        return 'issues';
    }
    if (/^(?:past\s+medical\s+history\s+and\s+medications?|past\s+medical(?:\/surgical)?\s+history|past\s+surgical\s+history|pmhx|phx|medical\s+history|medications?|current\s+medications?|medications?\s+and\s+allergies)$/.test(h)) {
        return 'phxMeds';
    }
    if (/^(?:investigation\s+results?|investigations?\s+and\s+previous\s+trials?|investigations?|results?|previous\s+trials?|prior\s+trials?|prior\s+treatments?|endoscopy\s+and\s+investigations?)$/.test(h)) {
        return 'ixTrials';
    }
    if (/^(?:plan|impression\s+and\s+plan|management|impression)$/.test(h)) {
        return 'plans';
    }
    if (/^(?:dietary\s+history|diet|social\s+and\s+family\s+history|social\s+history|family\s+history|medicolegal\s+and\s+consent|medicolegal|consent|examination|physical\s+examination|additional\s+clinical\s+notes?)$/.test(h)) {
        return 'ignore';
    }
    return null;
}

function formatConsultDate(encounterDate: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(encounterDate)) {
        return encounterDate;
    }
    const d = new Date(`${encounterDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) {
        return encounterDate;
    }
    return d.toLocaleDateString('en-AU', {
        timeZone: 'Australia/Melbourne',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function sortNotesNewestFirst(notes: PriorNoteInput[]): PriorNoteInput[] {
    return [...notes].sort((a, b) => {
        if (a.encounterDate === b.encounterDate) return 0;
        if (a.encounterDate === 'Today') return -1;
        if (b.encounterDate === 'Today') return 1;
        return b.encounterDate.localeCompare(a.encounterDate);
    });
}

/**
 * Deterministically slices prior consult notes by subtitle/heading using regex (zero LLM),
 * stacking extracted sections newest-consult-first into 4 boxes:
 * - Issues & Interval Hx
 * - PHx & Meds
 * - Ix & Prior Trials
 * - Plans
 *
 * Unknown bold subheadings (e.g. "**Ulcerative Colitis**" under Current Issues) are preserved
 * inside their parent section rather than ending capture.
 */
export function slicePriorNotesBySubtitle(priorNotes: PriorNoteInput[]): SlicedClinicalHistory {
    const result: SlicedClinicalHistory = {
        issues: [],
        phxMeds: [],
        ixTrials: [],
        plans: [],
    };

    if (!priorNotes || priorNotes.length === 0) {
        return result;
    }

    const sortedNotes = sortNotesNewestFirst(priorNotes);

    for (const note of sortedNotes) {
        if (!note.content || !note.content.trim()) continue;

        const bucketLines: Record<BucketKey, string[]> = {
            issues: [],
            phxMeds: [],
            ixTrials: [],
            plans: [],
        };

        let activeBucket: BucketKey | 'ignore' | null = null;
        let pendingSubheader: { bucket: BucketKey; title: string } | null = null;
        const lines = note.content.split(/\r?\n/);

        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) {
                if (activeBucket && activeBucket !== 'ignore' && bucketLines[activeBucket].length > 0) {
                    const last = bucketLines[activeBucket][bucketLines[activeBucket].length - 1];
                    if (last !== '') bucketLines[activeBucket].push('');
                }
                continue;
            }

            if (SIGN_OFF_STOP_RX.test(trimmed)) {
                activeBucket = 'ignore';
                pendingSubheader = null;
                continue;
            }

            const headingMatch = trimmed.match(HEADING_LINE_RX);
            if (headingMatch) {
                const rawTitle = (headingMatch[1] || headingMatch[2] || headingMatch[3] || headingMatch[4] || '').trim();
                const target = classifyTopLevelHeading(rawTitle);

                if (target === 'ignore') {
                    activeBucket = 'ignore';
                    pendingSubheader = null;
                    continue;
                }

                if (target !== null) {
                    activeBucket = target;
                    // For Issues & Interval Hx, preserve whether a block is Interval History vs Current Issues
                    if (target === 'issues' && /^(?:interval\s+history|current\s+issues?|issues?)$/i.test(rawTitle)) {
                        pendingSubheader = { bucket: 'issues', title: `**${rawTitle}**` };
                    } else {
                        pendingSubheader = null;
                    }
                    continue;
                }
                // target === null -> bold clinical subheading (e.g. **Ulcerative Colitis**), fall through to capture
            }

            if (activeBucket && activeBucket !== 'ignore') {
                if (pendingSubheader && pendingSubheader.bucket === activeBucket) {
                    if (bucketLines[activeBucket].length > 0) {
                        const last = bucketLines[activeBucket][bucketLines[activeBucket].length - 1];
                        if (last !== '') bucketLines[activeBucket].push('');
                    }
                    bucketLines[activeBucket].push(pendingSubheader.title);
                    pendingSubheader = null;
                }
                bucketLines[activeBucket].push(rawLine.trimEnd());
            }
        }

        const formattedDate = formatConsultDate(note.encounterDate);

        (['issues', 'phxMeds', 'ixTrials', 'plans'] as BucketKey[]).forEach((key) => {
            const joined = bucketLines[key].join('\n').trim();
            if (joined) {
                result[key].push({
                    id: `${note.id}-${key}`,
                    encounterDate: note.encounterDate,
                    formattedDate,
                    sourceLabel: note.label,
                    content: joined,
                });
            }
        });
    }

    return result;
}

/**
 * Legacy helper retained for compatibility with earlier snapshot exports.
 */
export function parseClinicalSnapshotFromNotes(priorNotes: PriorNoteInput[]): ClinicalSnapshot {
    const sliced = slicePriorNotesBySubtitle(priorNotes);
    return {
        keySx: sliced.issues[0]?.content || '',
        phx: sliced.phxMeds[0]?.content || '',
        ix: sliced.ixTrials[0]?.content || '',
        medsAndPlan: sliced.plans[0]?.content || '',
    };
}
