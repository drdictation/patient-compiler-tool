'use client';

import { Calendar, ClipboardCheck } from 'lucide-react';
import { TimelineEntry } from '@/components/timeline-entry';
import { TranscriptsPanel } from '@/components/transcripts-panel';
import { ClinicalSnapshotCard } from '@/components/clinical-snapshot-card';
import { PriorNoteInput } from '@/lib/clinical-snapshot';
import { PatientDetails, getPatientTimeline } from '@/lib/data';
import ReactMarkdown from 'react-markdown';

interface PatientContentViewProps {
    patient: PatientDetails;
    timeline: Awaited<ReturnType<typeof getPatientTimeline>>;
    priorNotes?: PriorNoteInput[];
}

function extractLastPlan(timeline: Awaited<ReturnType<typeof getPatientTimeline>>): { date: string; content: string } | null {
    for (const enc of timeline) {
        const noteArt = enc.artifacts.find(a => a.artifact_type === 'INTERNAL_NOTE');
        const letterArt = enc.artifacts.find(a => a.artifact_type === 'REFERRER_LETTER');
        const pick = noteArt || letterArt;
        if (!pick) continue;
        const text = (pick.versions.find(v => v.version_number === pick.current_version) || pick.versions[0])?.content;
        if (!text) continue;

        const lines = text.split(/\r?\n/);
        const planIdx = lines.findIndex(l => /^(#{1,4}\s*|\*\*)(impression and plan|plan)\b/i.test(l.trim()));
        if (planIdx !== -1) {
            const slice: string[] = [];
            for (let i = planIdx + 1; i < lines.length; i++) {
                const t = lines[i].trim();
                if (/^(#{1,4}\s+|\*\*[^*]+\*\*:?$)/.test(t) && slice.length > 0) break;
                if (/^(yours sincerely|kind regards|no action required|action required)/i.test(t) && slice.length > 0) break;
                if (t) slice.push(lines[i]);
                if (slice.length >= 6) break;
            }
            if (slice.length > 0) {
                return { date: enc.encounter_date, content: slice.join('\n') };
            }
        }
    }
    return null;
}

export function PatientContentView({
    patient,
    timeline,
    priorNotes = [],
}: PatientContentViewProps) {
    const lastPlan = extractLastPlan(timeline);

    return (
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-4 md:py-8 flex flex-col gap-6 md:gap-8 print:max-w-full print:px-0">
            <ClinicalSnapshotCard
                priorNotes={priorNotes}
                mode="page"
            />
            {lastPlan && (
                <section className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-indigo-900 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                            <ClipboardCheck className="h-3.5 w-3.5 text-indigo-600" />
                            Last Plan ({lastPlan.date})
                        </span>
                    </div>
                    <div className="text-slate-700 text-xs leading-relaxed prose prose-sm max-w-none">
                        <ReactMarkdown>{lastPlan.content}</ReactMarkdown>
                    </div>
                </section>
            )}
            {/* TIMELINE */}
            <section
                id="timeline"
                className="space-y-2"
            >
                <h2 className="text-base md:text-lg font-semibold text-slate-800 flex items-center gap-2 border-b pb-2 mb-4">
                    <Calendar className="h-4 w-4 md:h-5 md:w-5 text-indigo-600" />
                    Encounter Timeline
                    <span className="md:hidden text-xs text-muted-foreground font-normal">({timeline.length})</span>
                </h2>

                {timeline.length === 0 && (
                    <div className="text-center py-8 md:py-12 text-sm md:text-base text-muted-foreground border-2 border-dashed rounded-xl bg-white">
                        No encounters found for this patient.
                    </div>
                )}

                <div className="space-y-4 md:space-y-0 md:pl-1">
                    {timeline.map((encounter, index) => (
                        <TimelineEntry
                            key={encounter.id}
                            encounter={encounter}
                            isLast={index === timeline.length - 1}
                            isLatest={index === 0}
                            patientId={patient.id}
                            patientName={patient.display_name}
                            allEncounters={timeline.map(e => ({ id: e.id, encounter_date: e.encounter_date }))}
                        />
                    ))}
                </div>
            </section>

            {/* SAVED TRANSCRIPTS */}
            <section
                id="transcripts"
                className="scroll-mt-24"
            >
                <TranscriptsPanel patientName={patient.display_name} timeline={timeline} />
            </section>

        </div>
    );
}
