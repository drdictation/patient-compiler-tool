'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calendar, Stethoscope, ClipboardList, FileText } from 'lucide-react';
import { TimelineEntry } from '@/components/timeline-entry';
import { TranscriptsPanel } from '@/components/transcripts-panel';
import { PreVisitBrief } from '@/components/pre-visit-brief';
import { TasksPanel } from '@/components/tasks-panel';
import { IssuesPanel } from '@/components/issues-panel';
import { InvestigationsPanel } from '@/components/investigations-panel';
import { InterventionsPanel } from '@/components/interventions-panel';
import { PatientDetails } from '@/lib/data';

interface PatientMobileViewProps {
    patient: PatientDetails;
    timeline: any[];
    issues: any[];
    investigations: any[];
    interventions: any[];
    tasks: any[];
}

export function PatientMobileView({
    patient,
    timeline,
    issues,
    investigations,
    interventions,
    tasks
}: PatientMobileViewProps) {
    const [activeTab, setActiveTab] = useState('timeline');

    return (
        <div className="md:hidden px-4 py-4 space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid grid-cols-3 w-full h-11 p-1 bg-slate-100 rounded-xl">
                    <TabsTrigger value="timeline" className="text-xs font-semibold gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs">
                        <Calendar className="h-3.5 w-3.5" />
                        Timeline
                    </TabsTrigger>
                    <TabsTrigger value="clinical" className="text-xs font-semibold gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs">
                        <Stethoscope className="h-3.5 w-3.5" />
                        Clinical
                    </TabsTrigger>
                    <TabsTrigger value="recalls" className="text-xs font-semibold gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs">
                        <ClipboardList className="h-3.5 w-3.5" />
                        Recalls
                    </TabsTrigger>
                </TabsList>

                {/* TIMELINE TAB */}
                <TabsContent value="timeline" className="mt-4 space-y-6">
                    <section id="mobile-timeline" className="space-y-3">
                        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2 border-b pb-2">
                            <Calendar className="h-4 w-4 text-indigo-600" />
                            Encounter Timeline ({timeline.length})
                        </h2>

                        {timeline.length === 0 && (
                            <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-xl bg-white">
                                No encounters found.
                            </div>
                        )}

                        <div className="space-y-4">
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

                    <section id="mobile-transcripts">
                        <TranscriptsPanel patientName={patient.display_name} timeline={timeline} />
                    </section>
                </TabsContent>

                {/* CLINICAL STATE TAB */}
                <TabsContent value="clinical" className="mt-4 space-y-6">
                    <section id="mobile-brief">
                        <PreVisitBrief
                            patientName={patient.display_name}
                            patientId={patient.id}
                            issues={issues}
                            investigations={investigations}
                            interventions={interventions}
                        />
                    </section>

                    <section id="mobile-issues">
                        <IssuesPanel patientId={patient.id} issues={issues} />
                    </section>

                    <section id="mobile-interventions">
                        <InterventionsPanel patientId={patient.id} interventions={interventions} />
                    </section>
                </TabsContent>

                {/* RECALLS & TASKS TAB */}
                <TabsContent value="recalls" className="mt-4 space-y-6">
                    <section id="mobile-investigations">
                        <InvestigationsPanel patientId={patient.id} investigations={investigations} />
                    </section>

                    <section id="mobile-tasks">
                        <TasksPanel patientId={patient.id} tasks={tasks} />
                    </section>
                </TabsContent>
            </Tabs>
        </div>
    );
}
