import Link from 'next/link';
import { getPatientDetails, getPatientTimeline } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { EditablePatientTitle } from '@/components/editable-patient-title';
import { AddNoteDialog } from '@/components/add-note-dialog';
import { SmartNoteDialog } from '@/components/smart-note-dialog';
import { GlobalScanButton } from '@/components/global-scan-button';
import { PatientInfoToggle } from '@/components/patient-info-toggle';
import { PatientMobileActions } from '@/components/patient-mobile-actions';
import { GlobalSearch } from '@/components/global-search';
import { AddPatientDialog } from '@/components/add-patient-dialog';
import { CreateDocumentDialog } from '@/components/create-document-dialog';
import { PatientContentView } from '@/components/patient-content-view';
import { PatientQaWidget } from '@/components/patient-qa-widget';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const [patient, timeline] = await Promise.all([
        getPatientDetails(id),
        getPatientTimeline(id),
    ]);

    if (!patient) {
        notFound();
    }

    const priorNotes = timeline.flatMap(encounter => {
        const latestContent = (artifactType: 'INTERNAL_NOTE' | 'PATIENT_SUMMARY' | 'REFERRER_LETTER') => {
            const artifact = encounter.artifacts.find(item => item.artifact_type === artifactType);
            const version = artifact?.versions.find(item => item.version_number === artifact.current_version) || artifact?.versions[0];
            return version?.content;
        };

        const candidates = [
            { label: 'Consult note', content: latestContent('INTERNAL_NOTE') },
            { label: 'Encounter note', content: encounter.notes },
            { label: 'Patient summary', content: latestContent('PATIENT_SUMMARY') },
            ...encounter.source_records.map((record, index) => ({
                label: encounter.source_records.length > 1 ? `Formatted dictation ${index + 1}` : 'Formatted dictation',
                content: record.ai_formatted_transcription,
            })),
            { label: 'Referrer letter', content: latestContent('REFERRER_LETTER') },
        ];

        const selected = candidates.find(candidate => candidate.content?.trim());
        return selected?.content ? [{
            id: `${encounter.id}-${selected.label}`,
            encounterDate: encounter.encounter_date,
            label: selected.label,
            content: selected.content,
        }] : [];
    });

    return (
        <div className="w-full min-h-screen flex flex-col bg-gray-50/50">
            {/* Sticky Header */}
            <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-20 shadow-sm print:hidden">
                {/* Back button */}
                <Link href="/">
                    <Button variant="ghost" size="icon" className="-ml-1 flex-shrink-0">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>

                <div className="min-w-0 flex-1 sm:flex-none sm:max-w-48">
                    <EditablePatientTitle patientId={patient.id} initialName={patient.display_name} />
                </div>
                <div className="hidden sm:flex items-center gap-2 flex-wrap">
                    <GlobalSearch />
                    <AddPatientDialog />
                    <SmartNoteDialog patientId={patient.id} patientName={patient.display_name} mode="quick-record" priorNotes={priorNotes} />
                    <SmartNoteDialog patientId={patient.id} patientName={patient.display_name} mode="standard" priorNotes={priorNotes} />
                    <PatientQaWidget patientId={patient.id} patientName={patient.display_name} />
                    <details className="relative">
                        <summary className="cursor-pointer rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50">More</summary>
                        <div className="absolute right-0 top-full mt-2 z-30 flex min-w-56 flex-col items-stretch gap-2 rounded-lg border bg-white p-3 shadow-lg">
                            <AddNoteDialog patientId={patient.id} />
                            <CreateDocumentDialog patientId={patient.id} patientName={patient.display_name} encounters={timeline.map(e => ({ id: e.id, encounter_date: e.encounter_date }))} />
                            <GlobalScanButton patientId={patient.id} />
                            <PatientInfoToggle patient={patient} />
                        </div>
                    </details>
                    {patient.identity_verified && <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">Verified</Badge>}
                </div>
                <div className="sm:hidden"><GlobalSearch /></div>
            </div>

            {/* Two-Column Layout */}
            <div className="flex-1 flex print:block">
                {/* Main Content Area - Add bottom padding on mobile for action bar */}
                <main className="flex-1 overflow-y-auto print:overflow-visible pb-24 md:pb-0">
                    <PatientContentView
                        patient={patient}
                        timeline={timeline}
                    />
                </main>
            </div>

            {/* Mobile Action Bar - only visible on mobile */}
            <PatientMobileActions
                patientId={patient.id}
                patientName={patient.display_name}
                patient={patient}
                priorNotes={priorNotes}
            />
        </div>
    );
}
