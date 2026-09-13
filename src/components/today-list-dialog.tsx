'use client';

import { useState } from 'react';
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
import { ClipboardList, Users, Check, Search, Trash2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

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

    // Sync state when dialog opens
    const handleOpenChange = (isOpen: boolean) => {
        if (isOpen) {
            setCurrentIds(selectedIds);
            setPasteArea('');
            setSearchQuery('');
        }
        onOpenChange(isOpen);
    };

    const togglePatient = (id: string) => {
        setCurrentIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    // Auto-match names from pasted schedule
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
                        Allocate patients scheduled for today. Their latest notes, letters, and summaries will be pre-fetched for instant 0ms copy-pasting.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-5 py-2">
                    {/* Method 1: Paste Schedule */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                Option 1: Paste Schedule Names
                            </Label>
                            <span className="text-[11px] text-slate-400">One name per line</span>
                        </div>
                        <Textarea
                            placeholder="e.g.&#10;Smith, John&#10;Sarah Jenkins&#10;David Miller"
                            value={pasteArea}
                            onChange={(e) => setPasteArea(e.target.value)}
                            rows={3}
                            className="bg-white text-xs font-mono resize-none"
                        />
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={handleAutoMatch}
                            className="w-full text-xs font-semibold gap-1.5 h-8 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                        >
                            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                            Auto-Match &amp; Select Patients
                        </Button>
                    </div>

                    {/* Method 2: Manual Search & Check */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                Option 2: Search &amp; Check Patients ({currentIds.length} Selected)
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
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Filter patient directory..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-9 text-xs"
                            />
                        </div>

                        <ScrollArea className="h-56 border rounded-xl bg-white p-2">
                            <div className="space-y-1">
                                {filteredPatients.map(patient => {
                                    const isSelected = currentIds.includes(patient.id);
                                    return (
                                        <div
                                            key={patient.id}
                                            onClick={() => togglePatient(patient.id)}
                                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                                                isSelected ? 'bg-indigo-50/70 text-indigo-950 font-medium' : 'hover:bg-slate-50 text-slate-800'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={() => togglePatient(patient.id)}
                                                />
                                                <span>{patient.display_name}</span>
                                                {patient.referring_doctor && (
                                                    <span className="text-[10px] text-slate-400">
                                                        (Ref: {patient.referring_doctor})
                                                    </span>
                                                )}
                                            </div>
                                            {isSelected && (
                                                <Check className="h-4 w-4 text-indigo-600" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="flex items-center justify-between border-t pt-4">
                    {selectedIds.length > 0 ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleClear}
                            className="text-red-600 hover:bg-red-50 hover:text-red-700 text-xs gap-1.5"
                        >
                            <Trash2 className="h-4 w-4" />
                            Clear Today's List
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
