'use client';

import { Calendar } from 'lucide-react';
import { TimelineEntry } from '@/components/timeline-entry';
import { TranscriptsPanel } from '@/components/transcripts-panel';
import { PatientDetails, getPatientTimeline } from '@/lib/data';

interface PatientContentViewProps {
    patient: PatientDetails;
    timeline: Awaited<ReturnType<typeof getPatientTimeline>>;
}

export function PatientContentView({
    patient,
    timeline,
}: PatientContentViewProps) {
    return (
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-4 md:py-8 flex flex-col gap-6 md:gap-8 print:max-w-full print:px-0">
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
