'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
    FileScan,
    UploadCloud,
    Sparkles,
    CheckCircle2,
    Loader2,
    RefreshCw,
    User,
    Activity,
    ShieldAlert,
    Target,
    FileText,
    ClipboardList,
    HelpCircle,
    Check
} from 'lucide-react';
import { saveReferralIntakeResult, SaveReferralIntakeInput, ReferralIntakeMode } from '@/app/actions';

interface ReferralIntakeDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onPatientPrepped?: (patientId: string, displayName: string, prepNote: string) => void;
}

interface ParsedReferralData {
    patient: {
        displayName: string;
        dateOfBirth?: string;
        gender?: string;
        referringDoctor?: string;
        referralDate?: string;
    };
    procedure?: string;
    clinicalFocus?: string;
    summaryCard: {
        // Endoscopy mode
        indication?: string;
        risksAndContext?: string;
        proceduralActions?: string;
        // General consult mode
        reasonForReferral?: string;
        medicalHistoryAndMeds?: string;
        investigations?: string;
        questionsAndPlan?: string;
    };
    rawOcrText: string;
}

export function ReferralIntakeDialog({
    isOpen,
    onClose,
    onPatientPrepped
}: ReferralIntakeDialogProps) {
    const [intakeMode, setIntakeMode] = useState<ReferralIntakeMode>('endoscopy');
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [parsedData, setParsedData] = useState<ParsedReferralData | null>(null);
    const [editablePatient, setEditablePatient] = useState<{
        displayName: string;
        dateOfBirth: string;
        referringDoctor: string;
        procedure: string;
        clinicalFocus: string;
    }>({
        displayName: '',
        dateOfBirth: '',
        referringDoctor: '',
        procedure: '',
        clinicalFocus: ''
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset on close
    useEffect(() => {
        if (!isOpen) {
            setImagePreview(null);
            setParsedData(null);
            setIsExtracting(false);
            setIsSaving(false);
        }
    }, [isOpen]);

    // Extract clinical data from Base64 Data URL
    const extractFromDataUrl = useCallback(async (dataUrl: string, mode: ReferralIntakeMode) => {
        setIsExtracting(true);
        setParsedData(null);

        try {
            const res = await fetch('/api/referral-intake', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: dataUrl,
                    mode
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Extraction failed' }));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const result = await res.json();
            if (result.success && result.data) {
                const data: ParsedReferralData = result.data;
                setParsedData(data);
                setEditablePatient({
                    displayName: data.patient?.displayName || '',
                    dateOfBirth: data.patient?.dateOfBirth || '',
                    referringDoctor: data.patient?.referringDoctor || '',
                    procedure: data.procedure || 'Gastroscopy + Colonoscopy',
                    clinicalFocus: data.clinicalFocus || 'General Gastroenterology Consult'
                });
                toast.success(`Parsed referral for ${data.patient?.displayName || 'Patient'}`);
            } else {
                throw new Error('Could not parse referral details.');
            }
        } catch (err: any) {
            console.error('Extraction error:', err);
            toast.error(`Extraction failed: ${err.message || 'Unknown error'}`);
        } finally {
            setIsExtracting(false);
        }
    }, []);

    // Handle image file extraction
    const processImageFile = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Please paste or upload a valid image (PNG, JPG, WebP).');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const dataUrl = e.target?.result as string;
            setImagePreview(dataUrl);
            extractFromDataUrl(dataUrl, intakeMode);
        };
        reader.readAsDataURL(file);
    }, [intakeMode, extractFromDataUrl]);

    // Handle Mode change with re-extraction if image already exists
    const handleModeChange = (newMode: ReferralIntakeMode) => {
        if (newMode === intakeMode) return;
        setIntakeMode(newMode);
        if (imagePreview && !isExtracting) {
            extractFromDataUrl(imagePreview, newMode);
        }
    };

    // Global and dialog clipboard paste listener
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (!isOpen) return;
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) {
                        e.preventDefault();
                        processImageFile(file);
                        break;
                    }
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [isOpen, processImageFile]);

    // Save & Persist to Patient Record
    const handleSave = async () => {
        if (!parsedData) return;
        setIsSaving(true);

        try {
            const input: SaveReferralIntakeInput = {
                intakeMode,
                patient: {
                    displayName: editablePatient.displayName.trim() || 'Unknown Patient',
                    dateOfBirth: editablePatient.dateOfBirth.trim() || undefined,
                    referringDoctor: editablePatient.referringDoctor.trim() || undefined,
                    referralDate: parsedData.patient?.referralDate
                },
                procedure: editablePatient.procedure.trim() || 'Endoscopy',
                clinicalFocus: editablePatient.clinicalFocus.trim() || 'General Gastroenterology Consult',
                summaryCard: parsedData.summaryCard,
                rawOcrText: parsedData.rawOcrText
            };

            const result = await saveReferralIntakeResult(input);
            if (!result.success || !result.patientId) {
                throw new Error(result.error || 'Failed to save record.');
            }

            if (intakeMode === 'general') {
                toast.success(`${result.displayName} referral & consult notes saved to record!`);
            } else {
                toast.success(`${result.displayName} prepped & added to Today's List!`);
            }

            if (onPatientPrepped && result.prepNoteContent) {
                onPatientPrepped(result.patientId, result.displayName || 'Patient', result.prepNoteContent);
            }

            // Close dialog
            onClose();
        } catch (err: any) {
            console.error('Failed to save prep record:', err);
            toast.error(err.message || 'Failed to save.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 border shadow-2xl rounded-2xl">
                {/* Header */}
                <DialogHeader className="p-5 pb-4 border-b bg-slate-50/80 sticky top-0 z-10 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                                <FileScan className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-base font-bold text-slate-900">
                                    Referral Screenshot Intake
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-500">
                                    Paste a screenshot of the GP referral letter. Zero images stored; plain text and notes are added directly to the patient record.
                                </DialogDescription>
                            </div>
                        </div>
                    </div>

                    {/* Mode Toggle Tabs */}
                    <div className="bg-slate-200/70 p-1 rounded-xl flex items-center gap-1 text-xs">
                        <button
                            type="button"
                            onClick={() => handleModeChange('endoscopy')}
                            className={`flex-1 py-1.5 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                                intakeMode === 'endoscopy'
                                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Activity className="h-3.5 w-3.5" />
                            <span>Endoscopy List (Default)</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleModeChange('general')}
                            className={`flex-1 py-1.5 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                                intakeMode === 'general'
                                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <ClipboardList className="h-3.5 w-3.5" />
                            <span>General Notes</span>
                        </button>
                    </div>
                </DialogHeader>

                <div className="p-5 space-y-4">
                    {/* Paste or Upload Area */}
                    {!imagePreview && (
                        <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                const file = e.dataTransfer.files?.[0];
                                if (file) processImageFile(file);
                            }}
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/30 hover:bg-indigo-50/60 transition-all rounded-2xl p-8 text-center cursor-pointer space-y-3"
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) processImageFile(file);
                                }}
                            />
                            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                                <UploadCloud className="h-6 w-6" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-slate-900">
                                    Press <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-300 rounded-md shadow-2xs">Cmd + V</kbd> to paste screenshot
                                </p>
                                <p className="text-xs text-slate-500">
                                    {intakeMode === 'endoscopy'
                                        ? 'Extracts 3-point briefing card (indication, sedation/anticoagulant risks, biopsy plan)'
                                        : 'Extracts reason for referral, medical history, prior investigations, and consult questions'}
                                </p>
                            </div>
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-full text-[11px] text-slate-600 shadow-2xs">
                                <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                                <span>Powered by Gemini 2.5 Flash Vision</span>
                            </div>
                        </div>
                    )}

                    {/* Extraction Progress Loading State */}
                    {isExtracting && (
                        <div className="p-8 text-center border rounded-2xl bg-slate-50 space-y-3">
                            <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto" />
                            <div className="space-y-1">
                                <p className="text-sm font-bold text-slate-900">
                                    Analyzing Referral Letter ({intakeMode === 'endoscopy' ? 'Endoscopy Mode' : 'General Notes Mode'})...
                                </p>
                                <p className="text-xs text-slate-500">
                                    {intakeMode === 'endoscopy'
                                        ? 'Extracting demographics, procedure indication, anticoagulation status, and biopsy actions.'
                                        : 'Extracting GP referral history, symptoms, medications, prior investigations, and clinical questions.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Parsed Results Review */}
                    {parsedData && !isExtracting && (
                        <div className="space-y-4">
                            {/* Patient Demographics & Procedure / Focus Header */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                        <User className="h-3.5 w-3.5 text-slate-500" />
                                        Patient Demographics
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setImagePreview(null);
                                            setParsedData(null);
                                        }}
                                        className="h-7 text-xs text-slate-500 hover:text-slate-900 gap-1"
                                    >
                                        <RefreshCw className="h-3 w-3" />
                                        Paste Another
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-[11px] text-slate-500 font-semibold">Patient Name</Label>
                                        <Input
                                            value={editablePatient.displayName}
                                            onChange={(e) => setEditablePatient({ ...editablePatient, displayName: e.target.value })}
                                            className="h-8 text-xs font-semibold bg-white"
                                            placeholder="Patient Full Name"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px] text-slate-500 font-semibold">DOB</Label>
                                        <Input
                                            value={editablePatient.dateOfBirth}
                                            onChange={(e) => setEditablePatient({ ...editablePatient, dateOfBirth: e.target.value })}
                                            className="h-8 text-xs bg-white"
                                            placeholder="DD/MM/YYYY"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px] text-slate-500 font-semibold">
                                            {intakeMode === 'endoscopy' ? 'Procedure' : 'Clinical Focus / Reason'}
                                        </Label>
                                        <Input
                                            value={intakeMode === 'endoscopy' ? editablePatient.procedure : editablePatient.clinicalFocus}
                                            onChange={(e) => {
                                                if (intakeMode === 'endoscopy') {
                                                    setEditablePatient({ ...editablePatient, procedure: e.target.value });
                                                } else {
                                                    setEditablePatient({ ...editablePatient, clinicalFocus: e.target.value });
                                                }
                                            }}
                                            className="h-8 text-xs font-semibold text-indigo-700 bg-white"
                                            placeholder={intakeMode === 'endoscopy' ? 'e.g. Gastroscopy + Colonoscopy' : 'e.g. Altered bowel habit & anaemia'}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Cards: Dual Mode Presentation */}
                            {intakeMode === 'endoscopy' ? (
                                /* 3-Point Procedural Briefing Card */
                                <div className="border border-indigo-100 rounded-xl overflow-hidden shadow-xs">
                                    <div className="bg-indigo-600 text-white px-3.5 py-2 flex items-center justify-between text-xs font-bold">
                                        <div className="flex items-center gap-1.5">
                                            <Activity className="h-4 w-4" />
                                            <span>15-Second Endoscopy Briefing Card</span>
                                        </div>
                                        <span className="text-[11px] font-medium text-indigo-100">
                                            Auto-adds to Today&apos;s List
                                        </span>
                                    </div>

                                    <div className="p-4 bg-white space-y-3.5 text-xs text-slate-700">
                                        {/* 1. Indication */}
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                                <Target className="h-3.5 w-3.5 text-indigo-600" />
                                                <span>1. Indication & Clinical Symptoms</span>
                                            </div>
                                            <p className="pl-5 text-slate-600 leading-relaxed whitespace-pre-line">
                                                {parsedData.summaryCard?.indication || 'None specified'}
                                            </p>
                                        </div>

                                        {/* 2. Risks & Context */}
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                                                <span>2. Key Risks & Context (Anticoagulants / Allergies / Hx)</span>
                                            </div>
                                            <p className="pl-5 text-slate-600 leading-relaxed whitespace-pre-line">
                                                {parsedData.summaryCard?.risksAndContext || 'None identified'}
                                            </p>
                                        </div>

                                        {/* 3. Actions & Biopsies */}
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                                <span>3. Required Procedural & Biopsy Actions</span>
                                            </div>
                                            <p className="pl-5 text-slate-600 leading-relaxed whitespace-pre-line">
                                                {parsedData.summaryCard?.proceduralActions || 'Standard protocol'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* General Consult Pre-Review Card */
                                <div className="border border-indigo-100 rounded-xl overflow-hidden shadow-xs">
                                    <div className="bg-indigo-700 text-white px-3.5 py-2 flex items-center justify-between text-xs font-bold">
                                        <div className="flex items-center gap-1.5">
                                            <FileText className="h-4 w-4" />
                                            <span>Pre-Consult Clinical Review & Referral Summary</span>
                                        </div>
                                        <span className="text-[11px] font-medium text-indigo-100">
                                            Copies Referral + Notes to Record
                                        </span>
                                    </div>

                                    <div className="p-4 bg-white space-y-3.5 text-xs text-slate-700">
                                        {/* 1. Reason for Referral & Symptoms */}
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                                <Target className="h-3.5 w-3.5 text-indigo-600" />
                                                <span>1. Reason for Referral & Clinical Symptoms</span>
                                            </div>
                                            <p className="pl-5 text-slate-600 leading-relaxed whitespace-pre-line">
                                                {parsedData.summaryCard?.reasonForReferral || parsedData.summaryCard?.indication || 'None specified'}
                                            </p>
                                        </div>

                                        {/* 2. Medical History & Medications */}
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                                                <span>2. Past Medical History & Current Medications</span>
                                            </div>
                                            <p className="pl-5 text-slate-600 leading-relaxed whitespace-pre-line">
                                                {parsedData.summaryCard?.medicalHistoryAndMeds || parsedData.summaryCard?.risksAndContext || 'None recorded'}
                                            </p>
                                        </div>

                                        {/* 3. Prior Investigations */}
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                                <Activity className="h-3.5 w-3.5 text-blue-600" />
                                                <span>3. Prior Investigations & Findings</span>
                                            </div>
                                            <p className="pl-5 text-slate-600 leading-relaxed whitespace-pre-line">
                                                {parsedData.summaryCard?.investigations || 'None reported'}
                                            </p>
                                        </div>

                                        {/* 4. Questions & Plan */}
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                                <HelpCircle className="h-3.5 w-3.5 text-emerald-600" />
                                                <span>4. Key Questions & Consult Focus</span>
                                            </div>
                                            <p className="pl-5 text-slate-600 leading-relaxed whitespace-pre-line">
                                                {parsedData.summaryCard?.questionsAndPlan || parsedData.summaryCard?.proceduralActions || 'Review clinical history and management plan'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Direct Copy Notice */}
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
                                <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                                <span>
                                    Full referral letter and structured notes will be copied straight to <strong>{editablePatient.displayName || 'the patient'}</strong>&apos;s record.
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <DialogFooter className="p-4 bg-slate-50 border-t flex flex-row items-center justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        disabled={isSaving}
                        className="text-xs text-slate-500"
                    >
                        Cancel
                    </Button>

                    {parsedData && (
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || isExtracting}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-9 px-4 gap-2 rounded-xl shadow-xs"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="h-4 w-4" />
                                    {intakeMode === 'general' ? 'Save Referral & Consult Notes' : 'Save & Add to Today\'s List'}
                                </>
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
