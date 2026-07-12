'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { FilePlus2, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { generateAdditionalDocument } from '@/app/actions';
import { SmartNoteModel } from '@/lib/llm';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface EncounterOption {
    id: string;
    encounter_date: string;
}

interface CreateDocumentDialogProps {
    patientId: string;
    patientName: string;
    encounters: EncounterOption[];
    defaultEncounterId?: string;
    asIconButton?: boolean;
    onSuccess?: () => void;
}

export function CreateDocumentDialog({
    patientId,
    patientName,
    encounters,
    defaultEncounterId,
    asIconButton = false,
    onSuccess
}: CreateDocumentDialogProps) {
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    // Form states
    const [documentType, setDocumentType] = useState<'referral_letter' | 'patient_summary'>('referral_letter');
    const [selectedEncounterId, setSelectedEncounterId] = useState<string>(
        defaultEncounterId || (encounters.length > 0 ? encounters[0].id : '')
    );
    const [clinicianType, setClinicianType] = useState('');
    const [additionalContext, setAdditionalContext] = useState('');
    const [includePatientHistory, setIncludePatientHistory] = useState(false);
    const [isComplex, setIsComplex] = useState(false);
    const [pronouns, setPronouns] = useState<'auto' | 'he_him' | 'she_her' | 'they_them'>('auto');
    const [model, setModel] = useState<SmartNoteModel>('gemini-3-flash-preview');

    const handleGenerate = () => {
        if (!selectedEncounterId) {
            toast.error('Please select an encounter/consult date');
            return;
        }

        if (documentType === 'referral_letter' && !clinicianType.trim()) {
            toast.error('Please specify the clinician type (e.g., Cardiologist)');
            return;
        }

        startTransition(async () => {
            try {
                const result = await generateAdditionalDocument({
                    patientId,
                    encounterId: selectedEncounterId,
                    documentType,
                    clinicianType: documentType === 'referral_letter' ? clinicianType.trim() : undefined,
                    additionalContext: additionalContext.trim() || undefined,
                    includePatientHistory: documentType === 'referral_letter' ? includePatientHistory : false,
                    isComplex: documentType === 'referral_letter' ? isComplex : undefined,
                    pronouns: documentType === 'referral_letter' ? pronouns : undefined,
                    model
                });

                if (result.success) {
                    toast.success(`Generated ${documentType === 'referral_letter' ? 'Referral Letter' : 'Patient Summary'} successfully`);
                    
                    if (result.warnings && result.warnings.length > 0) {
                        console.warn('Document validation warnings accepted automatically:', result.warnings);
                    }
                    setOpen(false);
                    resetForm();
                    router.refresh();
                    if (onSuccess) onSuccess();
                } else {
                    toast.error(result.error || 'Failed to generate document');
                }
            } catch (e: any) {
                console.error(e);
                toast.error('An error occurred during generation: ' + (e.message || 'Unknown error'));
            }
        });
    };

    const resetForm = () => {
        setDocumentType('referral_letter');
        setSelectedEncounterId(defaultEncounterId || (encounters.length > 0 ? encounters[0].id : ''));
        setClinicianType('');
        setAdditionalContext('');
        setIncludePatientHistory(false);
        setIsComplex(false);
        setPronouns('auto');
        setModel('gemini-3-flash-preview');
    };

    // Date formatting helper
    const formatEncounterDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-AU', {
            day: 'numeric', month: 'short', year: 'numeric', weekday: 'short'
        });
    };

    const triggerButton = asIconButton ? (
        <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-indigo-600 border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50 hover:text-indigo-800 gap-1"
            title="Generate Referral or Summary"
        >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-xs">Generate Doc</span>
        </Button>
    ) : (
        <Button size="sm" variant="outline" className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50/50">
            <FilePlus2 className="h-4 w-4" />
            Generate Document
        </Button>
    );

    return (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
                {triggerButton}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-800">
                        <Sparkles className="h-5 w-5 text-indigo-600 animate-pulse" />
                        <span>Generate Additional Document</span>
                    </DialogTitle>
                    <DialogDescription>
                        Create a referral letter or a patient summary based on consultation discussion for {patientName}.
                    </DialogDescription>
                </DialogHeader>

                {encounters.length === 0 ? (
                    <div className="py-6 text-center space-y-2">
                        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
                        <p className="text-sm text-slate-600">This patient does not have any encounters recorded yet.</p>
                        <p className="text-xs text-muted-foreground">Add an encounter timeline entry first to generate documents.</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto px-1 py-2 space-y-5">
                        {/* Document Type Selection */}
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Document Type</Label>
                            <RadioGroup
                                value={documentType}
                                onValueChange={(v) => setDocumentType(v as any)}
                                className="grid grid-cols-2 gap-4"
                            >
                                <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-slate-50/50 transition-colors ${documentType === 'referral_letter' ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-200'}`}>
                                    <RadioGroupItem value="referral_letter" id="doc-referral" />
                                    <Label htmlFor="doc-referral" className="font-semibold text-sm cursor-pointer flex-1 text-slate-700">
                                        Referral Letter
                                        <span className="block text-[10px] font-normal text-slate-500 mt-0.5">To specialists or allied clinicians</span>
                                    </Label>
                                </div>
                                <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-slate-50/50 transition-colors ${documentType === 'patient_summary' ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-200'}`}>
                                    <RadioGroupItem value="patient_summary" id="doc-summary" />
                                    <Label htmlFor="doc-summary" className="font-semibold text-sm cursor-pointer flex-1 text-slate-700">
                                        Patient Summary
                                        <span className="block text-[10px] font-normal text-slate-500 mt-0.5">Concise, practical info for patient</span>
                                    </Label>
                                </div>
                            </RadioGroup>
                        </div>

                        {/* Encounter Select */}
                        <div className="space-y-1.5">
                            <Label htmlFor="document-encounter">Select Consult / Encounter</Label>
                            <Select value={selectedEncounterId} onValueChange={setSelectedEncounterId} disabled={!!defaultEncounterId}>
                                <SelectTrigger id="document-encounter" className="border-slate-200">
                                    <SelectValue placeholder="Select a consult date" />
                                </SelectTrigger>
                                <SelectContent>
                                    {encounters.map((enc) => (
                                        <SelectItem key={enc.id} value={enc.id}>
                                            Consult on {formatEncounterDate(enc.encounter_date)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Referral Fields */}
                        {documentType === 'referral_letter' && (
                            <div className="space-y-4 border rounded-lg p-4 bg-slate-50/50 border-slate-200">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="clinician-type">Type of Clinician / Specialist</Label>
                                        <Input
                                            id="clinician-type"
                                            placeholder="e.g., Cardiologist, Physiotherapist..."
                                            value={clinicianType}
                                            onChange={(e) => setClinicianType(e.target.value)}
                                            className="border-slate-200 bg-white"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="doc-pronouns">Patient Pronouns</Label>
                                        <Select value={pronouns} onValueChange={(v) => setPronouns(v as any)}>
                                            <SelectTrigger id="doc-pronouns" className="border-slate-200 bg-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="auto">Auto (Default)</SelectItem>
                                                <SelectItem value="he_him">He/Him</SelectItem>
                                                <SelectItem value="she_her">She/Her</SelectItem>
                                                <SelectItem value="they_them">They/Them</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between border-t pt-3">
                                    <div className="space-y-0.5 pr-4">
                                        <Label htmlFor="include-history" className="text-sm font-semibold text-slate-700">Include Recent History Context</Label>
                                        <p className="text-[10px] text-slate-500">Append notes/letters from up to the last 3 past consults for context</p>
                                    </div>
                                    <Switch
                                        id="include-history"
                                        checked={includePatientHistory}
                                        onCheckedChange={setIncludePatientHistory}
                                    />
                                </div>

                                <div className="flex items-center justify-between border-t pt-3">
                                    <div className="space-y-0.5 pr-4">
                                        <Label htmlFor="complex-letter" className="text-sm font-semibold text-slate-700">Detailed letter (transcript-supported)</Label>
                                        <p className="text-[10px] text-slate-500">Produces a more comprehensive letter covering all transcript-supported clinical details</p>
                                    </div>
                                    <Switch
                                        id="complex-letter"
                                        checked={isComplex}
                                        onCheckedChange={setIsComplex}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Context and Model */}
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="additional-context">
                                    Additional Clinician Context <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
                                </Label>
                                <Textarea
                                    id="additional-context"
                                    placeholder={documentType === 'referral_letter'
                                        ? "e.g., Please assess for cardiac etiology of chest pain, check echo results."
                                        : "e.g., Remind patient to take medication with food and follow-up after blood tests."
                                    }
                                    value={additionalContext}
                                    onChange={(e) => setAdditionalContext(e.target.value)}
                                    className="min-h-[100px] border-slate-200"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5 col-span-2">
                                    <Label htmlFor="doc-model">Gemini Model</Label>
                                    <Select value={model} onValueChange={(v) => setModel(v as SmartNoteModel)}>
                                        <SelectTrigger id="doc-model" className="border-slate-200">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="gemini-3-flash-preview">Gemini 3 Flash (Preview)</SelectItem>
                                            <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                                            <SelectItem value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash-Lite</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter className="border-t pt-4">
                    <>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                            Cancel
                        </Button>
                        {encounters.length > 0 && (
                            <Button
                                onClick={handleGenerate}
                                disabled={isPending}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-medium"
                            >
                                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                                {isPending ? 'Generating...' : 'Generate Document'}
                            </Button>
                        )}
                    </>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
