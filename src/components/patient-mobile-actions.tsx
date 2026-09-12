'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";
import { AddNoteDialog } from "@/components/add-note-dialog";
import { SmartNoteDialog } from "@/components/smart-note-dialog";
import { GlobalScanButton } from "@/components/global-scan-button";
import { PatientInfoToggle } from "@/components/patient-info-toggle";
import { MobileConsultSheet } from "@/components/mobile-consult-sheet";
import { PatientDetails } from "@/lib/data";

interface PatientMobileActionsProps {
    patientId: string;
    patientName: string;
    patient: PatientDetails;
    priorNotes?: Array<{ id: string; encounterDate: string; label: string; content: string }>;
}

export function PatientMobileActions({ patientId, patientName, patient, priorNotes = [] }: PatientMobileActionsProps) {
    const [mobileConsultOpen, setMobileConsultOpen] = useState(false);

    return (
        <>
            <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 backdrop-blur-md border-t shadow-lg safe-area-inset-bottom">
                <div className="flex items-center justify-around px-3 py-1.5 max-w-md mx-auto">
                    {/* Patient Info */}
                    <PatientInfoToggle patient={patient} asMobileButton />

                    {/* Manual Note */}
                    <AddNoteDialog patientId={patientId} asMobileButton />

                    {/* Prominent Centerpiece: Mobile Record Consult */}
                    <Button
                        onClick={() => setMobileConsultOpen(true)}
                        className="h-12 px-5 gap-2 rounded-full bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-bold text-xs shadow-md active:scale-95 transition-all -mt-3 border-2 border-white ring-2 ring-rose-100"
                    >
                        <Mic className="h-5 w-5" />
                        <span>Record</span>
                    </Button>

                    {/* Global Scan */}
                    <GlobalScanButton patientId={patientId} asMobileButton />

                    {/* Full Smart Note Dialog (for paste / advanced settings) */}
                    <SmartNoteDialog
                        patientId={patientId}
                        patientName={patientName}
                        asMobileButton
                        mode="standard"
                        priorNotes={priorNotes}
                    />
                </div>
            </div>

            {/* Purpose-Built Mobile Consult Sheet */}
            <MobileConsultSheet
                open={mobileConsultOpen}
                onOpenChange={setMobileConsultOpen}
                patientId={patientId}
                patientName={patientName}
                priorNotes={priorNotes}
            />
        </>
    );
}
