'use client';

import { PatientContentView } from './patient-content-view';
import { PatientDetails } from '@/lib/data';

interface PatientMobileViewProps {
    patient: PatientDetails;
    timeline: any[];
    issues: any[];
    investigations: any[];
    interventions: any[];
    tasks: any[];
}

/**
 * @deprecated Use PatientContentView directly. PatientMobileView forwards to PatientContentView.
 */
export function PatientMobileView(props: PatientMobileViewProps) {
    return <PatientContentView {...props} />;
}
