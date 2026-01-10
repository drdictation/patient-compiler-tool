'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, FileText, Scan, UserCog } from "lucide-react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { AddNoteDialog } from "@/components/add-note-dialog";
import { SmartNoteDialog } from "@/components/smart-note-dialog";
import { GlobalScanButton } from "@/components/global-scan-button";
import { PatientInfoToggle } from "@/components/patient-info-toggle";
import { PatientDetails } from "@/lib/data";

interface PatientMobileActionsProps {
    patientId: string;
    patientName: string;
    patient: PatientDetails;
}

export function PatientMobileActions({ patientId, patientName, patient }: PatientMobileActionsProps) {
    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t shadow-lg safe-area-inset-bottom">
            <div className="flex items-center justify-around px-2 py-2">
                {/* Add Note - inline dialog */}
                <AddNoteDialog patientId={patientId} asMobileButton />

                {/* Smart Note - inline dialog */}
                <SmartNoteDialog patientId={patientId} patientName={patientName} asMobileButton />

                {/* Global Scan */}
                <GlobalScanButton patientId={patientId} asMobileButton />

                {/* Patient Details */}
                <PatientInfoToggle patient={patient} asMobileButton />
            </div>
        </div>
    );
}
