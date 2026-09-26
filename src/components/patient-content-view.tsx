'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Stethoscope, ClipboardList } from 'lucide-react';
import { TimelineEntry } from '@/components/timeline-entry';
import { TranscriptsPanel } from '@/components/transcripts-panel';
import { PreVisitBrief } from '@/components/pre-visit-brief';
import { TasksPanel } from '@/components/tasks-panel';
import { IssuesPanel } from '@/components/issues-panel';
import { InvestigationsPanel } from '@/components/investigations-panel';
import { InterventionsPanel } from '@/components/interventions-panel';
import { PatientDetails } from '@/lib/data';
import { cn } from '@/lib/utils';

interface PatientContentViewProps {
    patient: PatientDetails;
    timeline: any[];
    issues: any[];
    investigations: any[];
    interventions: any[];
    tasks: any[];
}

export function PatientContentView({
    patient,
    timeline,
    issues,
    investigations,
    interventions,
    tasks,
}: PatientContentViewProps) {
    const [activeTab, setActiveTab] = useState('timeline');

    return (
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-4 md:py-8 flex flex-col gap-6 md:gap-8 print:max-w-full print:px-0">
            {/* Mobile Tab Switcher */}
            <div className="md:hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid grid-cols-3 w-full h-11 p-1 bg-slate-100 rounded-xl">
                        <TabsTrigger
                            value="timeline"
                            className="text-xs font-semibold gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs"
                        >
                            <Calendar className="h-3.5 w-3.5" />
                            Timeline
                        </TabsTrigger>
                        <TabsTrigger
                            value="clinical"
                            className="text-xs font-semibold gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs"
                        >
                            <Stethoscope className="h-3.5 w-3.5" />
                            Clinical
                        </TabsTrigger>
                        <TabsTrigger
                            value="recalls"
                            className="text-xs font-semibold gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs"
                        >
                            <ClipboardList className="h-3.5 w-3.5" />
                            Recalls
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* TIMELINE */}
            <section
                id="timeline"
                className={cn("space-y-2", activeTab !== 'timeline' && "hidden md:block")}
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
                className={cn(activeTab !== 'timeline' && "hidden md:block")}
            >
                <TranscriptsPanel patientName={patient.display_name} timeline={timeline} />
            </section>

            {/* PRE-VISIT BRIEF */}
            <section
                id="brief"
                className={cn(activeTab !== 'clinical' && "hidden md:block")}
            >
                <PreVisitBrief
                    patientName={patient.display_name}
                    patientId={patient.id}
                    issues={issues}
                    investigations={investigations}
                    interventions={interventions}
                />
            </section>

            {/* TASKS PANEL */}
            <section
                id="tasks"
                className={cn(activeTab !== 'recalls' && "hidden md:block")}
            >
                <TasksPanel patientId={patient.id} tasks={tasks} />
            </section>

            {/* ISSUES PANEL */}
            <section
                id="issues"
                className={cn(activeTab !== 'clinical' && "hidden md:block")}
            >
                <IssuesPanel patientId={patient.id} issues={issues} />
            </section>

            {/* INVESTIGATIONS PANEL */}
            <section
                id="investigations"
                className={cn(activeTab !== 'recalls' && "hidden md:block")}
            >
                <InvestigationsPanel patientId={patient.id} investigations={investigations} />
            </section>

            {/* INTERVENTIONS PANEL */}
            <section
                id="interventions"
                className={cn(activeTab !== 'clinical' && "hidden md:block")}
            >
                <InterventionsPanel patientId={patient.id} interventions={interventions} />
            </section>
        </div>
    );
}
