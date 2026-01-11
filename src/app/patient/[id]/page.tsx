import Link from 'next/link';
import { getPatientDetails, getPatientTimeline, getPatientIssues, getPatientInvestigations, getPatientInterventions, getPatientTasks } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Calendar, ChevronRight } from 'lucide-react';
import { TimelineEntry } from '@/components/timeline-entry';
import { EditablePatientTitle } from '@/components/editable-patient-title';
import { IssuesPanel } from '@/components/issues-panel';
import { InvestigationsPanel } from '@/components/investigations-panel';
import { InterventionsPanel } from '@/components/interventions-panel';
import { PreVisitBrief } from '@/components/pre-visit-brief';
import { PatientSidebar } from '@/components/patient-sidebar';
import { AddNoteDialog } from '@/components/add-note-dialog';
import { SmartNoteDialog } from '@/components/smart-note-dialog';
import { GlobalScanButton } from '@/components/global-scan-button';
import { PatientInfoToggle } from '@/components/patient-info-toggle';
import { PatientMobileActions } from '@/components/patient-mobile-actions';
import { TasksPanel } from '@/components/tasks-panel';

export const dynamic = 'force-dynamic';

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const patient = await getPatientDetails(id);
    const timeline = await getPatientTimeline(id);
    const issues = await getPatientIssues(id);
    const investigations = await getPatientInvestigations(id);
    const interventions = await getPatientInterventions(id);
    const tasks = await getPatientTasks(id);

    // Calculate counts for sidebar
    const activeIssuesCount = issues.filter(i =>
        (i.lifecycle_state === 'accepted' || i.lifecycle_state === 'clinician_entered') &&
        i.status === 'active'
    ).length;

    const upcomingRecallsCount = investigations.filter(i =>
        (i.lifecycle_state === 'accepted' || i.lifecycle_state === 'clinician_entered') &&
        i.next_due_date
    ).length;

    const ongoingInterventionsCount = interventions.filter(i =>
        (i.lifecycle_state === 'accepted' || i.lifecycle_state === 'clinician_entered') &&
        i.response === 'Ongoing'
    ).length;

    return (
        <div className="w-full min-h-screen flex flex-col bg-gray-50/50">
            {/* Sticky Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm print:hidden">
                <div className="flex items-center gap-4">
                    <Link href="/">
                        <Button variant="ghost" size="icon" className="-ml-2">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    {/* Breadcrumbs */}
                    <nav className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground">
                        <Link href="/" className="hover:text-foreground transition-colors">
                            Dashboard
                        </Link>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-foreground font-medium truncate max-w-[200px]">
                            {patient.display_name}
                        </span>
                    </nav>
                    <div className="sm:hidden">
                        <div className="flex items-center gap-3">
                            <EditablePatientTitle
                                patientId={patient.id}
                                initialName={patient.display_name}
                            />
                            {patient.identity_verified && (
                                <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">
                                    Verified
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
                <div className="hidden sm:flex items-center gap-3">
                    <EditablePatientTitle
                        patientId={patient.id}
                        initialName={patient.display_name}
                    />
                    {patient.identity_verified && (
                        <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">
                            Verified
                        </Badge>
                    )}
                    <PatientInfoToggle patient={patient} />
                    <GlobalScanButton patientId={patient.id} />
                    <SmartNoteDialog patientId={patient.id} patientName={patient.display_name} />
                    <AddNoteDialog patientId={patient.id} />
                </div>
            </div>

            {/* Two-Column Layout */}
            <div className="flex-1 flex print:block">
                {/* Sidebar - Hidden on mobile, visible on lg+ */}
                <PatientSidebar
                    patientName={patient.display_name}
                    activeIssuesCount={activeIssuesCount}
                    upcomingRecallsCount={upcomingRecallsCount}
                    ongoingInterventionsCount={ongoingInterventionsCount}
                />

                {/* Main Content Area - Add bottom padding on mobile for action bar */}
                <main className="flex-1 overflow-y-auto print:overflow-visible pb-20 md:pb-0">
                    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 space-y-8 print:max-w-full print:px-0">

                        {/* PRE-VISIT BRIEF */}
                        <section id="brief">
                            <PreVisitBrief
                                patientName={patient.display_name}
                                patientId={patient.id}
                                issues={issues}
                                investigations={investigations}
                                interventions={interventions}
                            />
                        </section>

                        {/* TASKS PANEL */}
                        <section id="tasks">
                            <TasksPanel patientId={patient.id} tasks={tasks} />
                        </section>

                        {/* ISSUES PANEL */}
                        <section id="issues">
                            <IssuesPanel patientId={patient.id} issues={issues} />
                        </section>

                        {/* INVESTIGATIONS PANEL */}
                        <section id="investigations">
                            <InvestigationsPanel patientId={id} investigations={investigations} />
                        </section>

                        {/* INTERVENTIONS PANEL */}
                        <section id="interventions">
                            <InterventionsPanel patientId={id} interventions={interventions} />
                        </section>

                        {/* TIMELINE */}
                        <section id="timeline" className="space-y-2">
                            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 border-b pb-2 mb-4">
                                <Calendar className="h-5 w-5 text-indigo-600" />
                                Encounter Timeline
                            </h2>

                            {timeline.length === 0 && (
                                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-white">
                                    No encounters found for this patient.
                                </div>
                            )}

                            <div className="pl-1">
                                {timeline.map((encounter, index) => (
                                    <TimelineEntry
                                        key={encounter.id}
                                        encounter={encounter}
                                        isLast={index === timeline.length - 1}
                                    />
                                ))}
                            </div>
                        </section>
                    </div>
                </main>
            </div>

            {/* Mobile Action Bar - only visible on mobile */}
            <PatientMobileActions
                patientId={patient.id}
                patientName={patient.display_name}
                patient={patient}
            />
        </div>
    );
}
