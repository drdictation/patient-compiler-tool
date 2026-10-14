'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { 
    ClipboardList, Users, Check, Search, Trash2, Sparkles, X, 
    UploadCloud, Loader2, UserPlus, AlertCircle, CheckCircle2, ChevronRight 
} from 'lucide-react';
import { toast } from 'sonner';
import { createPatient } from '@/app/actions';

interface PatientOption {
    id: string;
    display_name: string;
    normalized_name: string;
    referring_doctor?: string | null;
}

interface TodayListDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    patients: PatientOption[];
    selectedIds: string[];
    onSaveList: (ids: string[]) => void;
}

interface SchedulePatientEntry {
    rawText: string;
    surname: string;
    firstName: string;
    fullDisplayName: string;
    notes?: string | null;
}

interface MatchResolution {
    entry: SchedulePatientEntry;
    status: 'exact' | 'ambiguous' | 'new';
    candidates: PatientOption[];
    selectedPatientId: string | null;
    isCreatingNew?: boolean;
}

export function TodayListDialog({
    open,
    onOpenChange,
    patients,
    selectedIds,
    onSaveList
}: TodayListDialogProps) {
    const [currentIds, setCurrentIds] = useState<string[]>(selectedIds);
    const [pasteArea, setPasteArea] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Schedule screenshot state
    const [isParsingImage, setIsParsingImage] = useState(false);
    const [parsedSchedule, setParsedSchedule] = useState<MatchResolution[]>([]);
    const [isCreatingPatientId, setIsCreatingPatientId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Synchronize currentIds with selectedIds on open
    useEffect(() => {
        if (open) {
            setCurrentIds(selectedIds);
            setPasteArea('');
            setSearchQuery('');
            setParsedSchedule([]);
            setIsParsingImage(false);
        }
    }, [open, selectedIds]);

    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen) {
            setPasteArea('');
            setSearchQuery('');
            setParsedSchedule([]);
            setIsParsingImage(false);
        }
        onOpenChange(isOpen);
    };

    const togglePatient = (id: string) => {
        setCurrentIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    // Auto-match names from pasted text
    const handleAutoMatch = () => {
        if (!pasteArea.trim()) {
            toast.error('Please paste some patient names');
            return;
        }

        const lines = pasteArea
            .split('\n')
            .map(l => l.trim().toLowerCase())
            .filter(Boolean);

        const newlyMatchedIds: string[] = [];

        lines.forEach(line => {
            const match = patients.find(p => {
                const nameLower = p.display_name.toLowerCase();
                const normLower = p.normalized_name.toLowerCase();
                return nameLower.includes(line) || normLower.includes(line) || line.includes(nameLower);
            });

            if (match && !newlyMatchedIds.includes(match.id)) {
                newlyMatchedIds.push(match.id);
            }
        });

        if (newlyMatchedIds.length === 0) {
            toast.error('No matching patients found. Please check spelling.');
            return;
        }

        setCurrentIds(prev => Array.from(new Set([...prev, ...newlyMatchedIds])));
        toast.success(`Matched ${newlyMatchedIds.length} patient(s) from pasted list!`);
        setPasteArea('');
    };

    // Classify candidate matches from parsed schedule item
    const matchScheduleEntries = useCallback((entries: SchedulePatientEntry[]): MatchResolution[] => {
        return entries.map(entry => {
            const sLower = (entry.surname || '').toLowerCase().trim();
            const fLower = (entry.firstName || '').toLowerCase().trim();
            const fullLower = (entry.fullDisplayName || '').toLowerCase().trim();

            const candidates = patients.filter(p => {
                const pNameLower = p.display_name.toLowerCase();
                const pNormLower = p.normalized_name.toLowerCase();

                // Exact full name match
                if (pNameLower === fullLower || pNormLower === fullLower) return true;

                // Both surname and first name contained in candidate name
                if (sLower && fLower && pNameLower.includes(sLower) && pNameLower.includes(fLower)) {
                    return true;
                }

                // Match surname if 3+ chars and candidate has surname
                if (sLower && sLower.length >= 3) {
                    const words = pNormLower.split(/\s+/);
                    if (words.some(w => w === sLower)) return true;
                }

                return false;
            });

            // Single exact match
            if (candidates.length === 1) {
                return {
                    entry,
                    status: 'exact',
                    candidates,
                    selectedPatientId: candidates[0].id
                };
            }

            // Ambiguous multiple matches
            if (candidates.length > 1) {
                // If one candidate is an exact match on full name, prefer it
                const exact = candidates.find(c => c.display_name.toLowerCase() === fullLower || c.normalized_name.toLowerCase() === fullLower);
                return {
                    entry,
                    status: 'ambiguous',
                    candidates,
                    selectedPatientId: exact ? exact.id : null
                };
            }

            // New patient not found in database
            return {
                entry,
                status: 'new',
                candidates: [],
                selectedPatientId: null
            };
        });
    }, [patients]);

    // Send screenshot image to server OCR
    const processScreenshot = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Please paste or upload an image file (PNG, JPG, WebP)');
            return;
        }

        setIsParsingImage(true);
        try {
            const formData = new FormData();
            formData.append('image', file);

            const res = await fetch('/api/schedule-intake', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Failed to read image' }));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const rawPatients: SchedulePatientEntry[] = data.patients || [];

            if (rawPatients.length === 0) {
                toast.warning('No patient appointments detected in this screenshot.');
                return;
            }

            const resolutions = matchScheduleEntries(rawPatients);
            
            // Append new items to review table (avoid duplicate raw text)
            setParsedSchedule(prev => {
                const existingTexts = new Set(prev.map(p => p.entry.rawText.toLowerCase().trim()));
                const incomingFiltered = resolutions.filter(r => !existingTexts.has(r.entry.rawText.toLowerCase().trim()));
                return [...prev, ...incomingFiltered];
            });

            // Auto-select exact matches into currentIds (appends without overriding)
            const exactIds = resolutions
                .filter(r => r.status === 'exact' && r.selectedPatientId)
                .map(r => r.selectedPatientId as string);

            if (exactIds.length > 0) {
                setCurrentIds(prev => Array.from(new Set([...prev, ...exactIds])));
            }

            const exactCount = resolutions.filter(r => r.status === 'exact').length;
            const ambiguousCount = resolutions.filter(r => r.status === 'ambiguous').length;
            const newCount = resolutions.filter(r => r.status === 'new').length;

            toast.success(`Scanned +${rawPatients.length} patients (${exactCount} matched, ${ambiguousCount} multiple, ${newCount} new)`);
        } catch (err: any) {
            console.error('Schedule parse error:', err);
            toast.error(err.message || 'Failed to parse screenshot');
        } finally {
            setIsParsingImage(false);
        }
    }, [matchScheduleEntries]);

    // Handle pasting an image into the dialog
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (!open) return;
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) {
                        e.preventDefault();
                        processScreenshot(file);
                        break;
                    }
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [open, processScreenshot]);

    // Handle creating a new patient from schedule row
    const handleCreateNewPatient = async (index: number) => {
        const item = parsedSchedule[index];
        if (!item) return;

        const nameToCreate = item.entry.fullDisplayName || `${item.entry.firstName} ${item.entry.surname}`.trim();
        setIsCreatingPatientId(nameToCreate);

        try {
            const { id } = await createPatient(nameToCreate);
            toast.success(`Created patient "${nameToCreate}"`);

            // Add newly created patient to selected IDs
            setCurrentIds(prev => Array.from(new Set([...prev, id])));

            // Update row in parsedSchedule
            setParsedSchedule(prev => {
                const next = [...prev];
                next[index] = {
                    ...next[index],
                    status: 'exact',
                    selectedPatientId: id
                };
                return next;
            });
        } catch (e: any) {
            toast.error(e.message || 'Failed to create patient');
        } finally {
            setIsCreatingPatientId(null);
        }
    };

    // Handle resolving an ambiguous candidate selection
    const handleSelectAmbiguousCandidate = (index: number, patientId: string) => {
        const prevSelected = parsedSchedule[index]?.selectedPatientId;

        // If previously selected, remove it from currentIds
        if (prevSelected) {
            setCurrentIds(prev => prev.filter(id => id !== prevSelected));
        }

        if (patientId) {
            setCurrentIds(prev => Array.from(new Set([...prev, patientId])));
        }

        setParsedSchedule(prev => {
            const next = [...prev];
            next[index] = {
                ...next[index],
                selectedPatientId: patientId || null
            };
            return next;
        });
    };

    const handleSave = () => {
        onSaveList(currentIds);
        onOpenChange(false);
        toast.success(`Today's list updated with ${currentIds.length} patient(s)`);
    };

    const handleClear = () => {
        if (confirm("Clear all patients from today's list?")) {
            setCurrentIds([]);
            onSaveList([]);
            onOpenChange(false);
            toast.info("Today's list cleared");
        }
    };

    const filteredPatients = patients.filter(p => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return p.display_name.toLowerCase().includes(q) || p.normalized_name.toLowerCase().includes(q);
    });

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                        <ClipboardList className="h-5 w-5 text-indigo-600" />
                        Set Up Today's Scope &amp; Consulting List
                    </DialogTitle>
                    <DialogDescription>
                        Paste a schedule screenshot, paste names, or search patients. Notes and letters pre-cached for 0ms copying.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 py-1">
                    {/* Schedule Screenshot Dropzone / Paste */}
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="relative p-3.5 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 hover:bg-indigo-50/70 rounded-xl cursor-pointer transition-all text-center group"
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) processScreenshot(file);
                            }}
                        />

                        {isParsingImage ? (
                            <div className="py-2 flex items-center justify-center gap-2 text-xs font-semibold text-indigo-700">
                                <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                                <span>Scanning schedule screenshot with Gemini Vision...</span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center gap-3">
                                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 group-hover:scale-105 transition-transform">
                                    <UploadCloud className="h-4 w-4" />
                                </div>
                                <div className="text-left">
                                    <p className="text-xs font-bold text-slate-800">
                                        Paste Schedule Screenshot (Cmd + V) or Click to Upload
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                        Auto-matches existing patients, flags new patients, and highlights similar names to choose from
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Screenshot Review Table (shown if schedule parsed) */}
                    {parsedSchedule.length > 0 && (
                        <div className="border border-indigo-200 rounded-xl p-3 bg-white space-y-2 shadow-2xs">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                                    <span>Parsed Schedule Review ({parsedSchedule.length} patients)</span>
                                </Label>
                                <button
                                    type="button"
                                    onClick={() => setParsedSchedule([])}
                                    className="text-[11px] text-slate-400 hover:text-slate-600"
                                >
                                    Dismiss
                                </button>
                            </div>

                            <ScrollArea className="max-h-56">
                                <div className="space-y-1.5 pr-2">
                                    {parsedSchedule.map((item, idx) => {
                                        const isSelected = item.selectedPatientId ? currentIds.includes(item.selectedPatientId) : false;

                                        return (
                                            <div 
                                                key={idx}
                                                className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                                                    item.status === 'exact' 
                                                        ? 'bg-emerald-50/50 border-emerald-200'
                                                        : item.status === 'ambiguous'
                                                        ? 'bg-amber-50/50 border-amber-200'
                                                        : 'bg-rose-50/50 border-rose-200'
                                                }`}
                                            >
                                                {/* Patient info from schedule */}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-semibold text-slate-900 truncate">
                                                            {item.entry.fullDisplayName}
                                                        </span>
                                                        {item.entry.notes && (
                                                            <span className="text-[10px] text-slate-500 font-mono truncate">
                                                                [{item.entry.notes}]
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Status text */}
                                                    <div className="text-[11px] mt-0.5">
                                                        {item.status === 'exact' && (
                                                            <span className="text-emerald-700 flex items-center gap-1 font-medium">
                                                                <CheckCircle2 className="h-3 w-3" />
                                                                Matched to {item.candidates[0]?.display_name || 'record'}
                                                            </span>
                                                        )}
                                                        {item.status === 'ambiguous' && (
                                                            <span className="text-amber-800 flex items-center gap-1 font-medium">
                                                                <AlertCircle className="h-3 w-3 text-amber-600" />
                                                                {item.candidates.length} similar patients found - pick below:
                                                            </span>
                                                        )}
                                                        {item.status === 'new' && (
                                                            <span className="text-rose-700 flex items-center gap-1 font-medium">
                                                                <UserPlus className="h-3 w-3 text-rose-600" />
                                                                New patient (not in database)
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Ambiguous Dropdown Picker */}
                                                    {item.status === 'ambiguous' && (
                                                        <div className="mt-1.5">
                                                            <select
                                                                value={item.selectedPatientId || ''}
                                                                onChange={(e) => handleSelectAmbiguousCandidate(idx, e.target.value)}
                                                                className="w-full text-xs bg-white border border-amber-300 rounded-md p-1 font-medium text-slate-800 focus:outline-hidden"
                                                            >
                                                                <option value="">-- Choose patient --</option>
                                                                {item.candidates.map(c => (
                                                                    <option key={c.id} value={c.id}>
                                                                        {c.display_name} {c.referring_doctor ? `(Ref: ${c.referring_doctor})` : ''}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Action Column */}
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    {item.status === 'new' && (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={isCreatingPatientId === item.entry.fullDisplayName}
                                                            onClick={() => handleCreateNewPatient(idx)}
                                                            className="h-7 px-2.5 text-[11px] font-semibold bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50 gap-1 rounded-md"
                                                        >
                                                            {isCreatingPatientId === item.entry.fullDisplayName ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <UserPlus className="h-3 w-3" />
                                                            )}
                                                            <span>Create Patient</span>
                                                        </Button>
                                                    )}

                                                    {item.selectedPatientId && (
                                                        <Checkbox
                                                            checked={isSelected}
                                                            onCheckedChange={() => togglePatient(item.selectedPatientId!)}
                                                            className="data-[state=checked]:bg-indigo-600"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </ScrollArea>
                        </div>
                    )}

                    {/* Method 2: Paste Text Names */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                Option: Paste Text Schedule
                            </Label>
                            <span className="text-[11px] text-slate-400">One name per line</span>
                        </div>
                        <Textarea
                            placeholder="e.g.&#10;Smith, John&#10;Sarah Jenkins&#10;David Miller"
                            value={pasteArea}
                            onChange={(e) => setPasteArea(e.target.value)}
                            rows={2}
                            className="bg-white text-xs font-mono resize-none h-16"
                        />
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={handleAutoMatch}
                            className="w-full text-xs font-semibold gap-1.5 h-7 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                        >
                            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                            Auto-Match Text Names
                        </Button>
                    </div>

                    {/* Method 3: Manual Search & Check */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                Patient Directory ({currentIds.length} Selected)
                            </Label>
                            {currentIds.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setCurrentIds([])}
                                    className="text-[11px] text-red-600 hover:underline font-medium"
                                >
                                    Deselect All
                                </button>
                            )}
                        </div>

                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Filter directory by name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-8 h-8 text-xs"
                            />
                        </div>

                        <ScrollArea className="h-44 border rounded-xl bg-white p-2">
                            <div className="space-y-1">
                                {filteredPatients.map(patient => {
                                    const isSelected = currentIds.includes(patient.id);
                                    return (
                                        <div
                                            key={patient.id}
                                            onClick={() => togglePatient(patient.id)}
                                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                                                isSelected ? 'bg-indigo-50/80 text-indigo-950 font-medium' : 'hover:bg-slate-50 text-slate-800'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <Checkbox
                                                    id={`today-p-${patient.id}`}
                                                    checked={isSelected}
                                                    onCheckedChange={() => togglePatient(patient.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <span className="truncate">{patient.display_name}</span>
                                                {patient.referring_doctor && (
                                                    <span className="text-[10px] text-slate-400 truncate">
                                                        (Ref: {patient.referring_doctor})
                                                    </span>
                                                )}
                                            </div>
                                            {isSelected && (
                                                <Check className="h-3.5 w-3.5 text-indigo-600 flex-shrink-0" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="flex items-center justify-between border-t pt-3">
                    {selectedIds.length > 0 ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleClear}
                            className="text-red-600 hover:bg-red-50 hover:text-red-700 text-xs gap-1.5"
                        >
                            <Trash2 className="h-4 w-4" />
                            Clear List
                        </Button>
                    ) : <div />}

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleSave}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4"
                        >
                            Save List ({currentIds.length})
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

