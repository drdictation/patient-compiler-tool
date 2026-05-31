'use client';

import { useState, useTransition } from 'react';
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
    DialogTrigger,
} from "@/components/ui/dialog";
import { 
    ClipboardList, Users, Check, Copy, Printer, Loader2, Search, X, Sparkles 
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface EndoscopyListDialogProps {
    patients: Array<{
        id: string;
        display_name: string;
        normalized_name: string;
    }>;
}

export function EndoscopyListDialog({ patients }: EndoscopyListDialogProps) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [pasteArea, setPasteArea] = useState('');
    const [isGenerating, startTransition] = useTransition();
    const [briefingReport, setBriefingReport] = useState<string | null>(null);
    const [isCopied, setIsCopied] = useState(false);

    // Toggle patient selection
    const togglePatient = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    // Auto-match names from typed/pasted text schedule list
    const handleAutoMatch = () => {
        if (!pasteArea.trim()) {
            toast.error('Please paste or type some patient names');
            return;
        }

        const lines = pasteArea
            .split('\n')
            .map(l => l.trim().toLowerCase())
            .filter(Boolean);

        const newlyMatchedIds: string[] = [];

        lines.forEach(line => {
            // Find a matching patient in the database
            const match = patients.find(p => {
                const displayNameLower = p.display_name.toLowerCase();
                const normalizedName = p.normalized_name.toLowerCase();
                return displayNameLower.includes(line) || normalizedName.includes(line) || line.includes(displayNameLower);
            });

            if (match && !newlyMatchedIds.includes(match.id)) {
                newlyMatchedIds.push(match.id);
            }
        });

        if (newlyMatchedIds.length === 0) {
            toast.error('No matching patients found in database. Check spelling.');
            return;
        }

        setSelectedIds(prev => Array.from(new Set([...prev, ...newlyMatchedIds])));
        toast.success(`Auto-matched & checked ${newlyMatchedIds.length} patient(s)!`);
        setPasteArea('');
    };

    // Call Endoscopy Briefing API endpoint
    const handleGenerate = () => {
        if (selectedIds.length === 0) {
            toast.error('Please select at least one patient');
            return;
        }

        startTransition(async () => {
            try {
                const response = await fetch('/api/endoscopy-briefing', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ patientIds: selectedIds }),
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to generate briefing sheet');

                setBriefingReport(data.briefing);
                toast.success('Endoscopy List Briefing created successfully!');
            } catch (e: any) {
                console.error(e);
                toast.error(`Briefing failed: ${e.message}`);
            }
        });
    };

    // Copy markdown report to clipboard
    const handleCopy = () => {
        if (!briefingReport) return;
        navigator.clipboard.writeText(briefingReport);
        setIsCopied(true);
        toast.success('Briefing report copied to clipboard!');
        setTimeout(() => setIsCopied(false), 2000);
    };

    // Print A4-optimized page
    const handlePrint = () => {
        window.print();
    };

    const resetDialog = () => {
        setSearchQuery('');
        setSelectedIds([]);
        setPasteArea('');
        setBriefingReport(null);
        setIsCopied(false);
    };

    // Filter patients by search query
    const filteredPatients = patients.filter(p =>
        p.display_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <>
            {/* Inject print-only styles so only the briefing sheet prints beautifully */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    body > *:not(#endoscopy-brief-print) {
                        display: none !important;
                        visibility: hidden !important;
                    }
                    #endoscopy-brief-print, #endoscopy-brief-print * {
                        visibility: visible !important;
                        display: block !important;
                    }
                    #endoscopy-brief-print {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        background: white !important;
                        color: black !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        box-shadow: none !important;
                    }
                    .print-break {
                        page-break-after: always;
                        break-after: page;
                    }
                }
            `}} />

            {/* Print-only Aggregated Container */}
            {briefingReport && (
                <div id="endoscopy-brief-print" className="hidden p-8 bg-white text-black font-sans print:block">
                    <div className="prose max-w-none text-black">
                        <ReactMarkdown>{briefingReport}</ReactMarkdown>
                    </div>
                </div>
            )}

            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetDialog(); }}>
                <DialogTrigger asChild>
                    <Button size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                        <ClipboardList className="h-4 w-4" />
                        Endoscopy List Creator
                    </Button>
                </DialogTrigger>
                <DialogContent className={`${briefingReport ? 'sm:max-w-[850px] sm:max-h-[90vh]' : 'sm:max-w-[650px]'} flex flex-col`}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                            <ClipboardList className="h-5 w-5 text-indigo-600 animate-pulse" />
                            Endoscopy List Briefing Creator
                        </DialogTitle>
                        <DialogDescription>
                            Prepare clinical summaries and recommended actions for patients on your endoscopy schedule.
                        </DialogDescription>
                    </DialogHeader>

                    {/* View Report if Generated */}
                    {briefingReport ? (
                        <div className="flex-1 flex flex-col overflow-hidden py-2 space-y-4">
                            <div className="flex items-center justify-between border-b pb-2">
                                <span className="text-sm font-semibold text-slate-600">
                                    Selected Patients: {selectedIds.length}
                                </span>
                                <div className="flex gap-2">
                                    <Button onClick={handleCopy} variant="outline" size="sm" className="gap-1.5 h-8">
                                        {isCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                        {isCopied ? 'Copied' : 'Copy'}
                                    </Button>
                                    <Button onClick={handlePrint} size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 h-8">
                                        <Printer className="h-4 w-4" />
                                        Print Briefing
                                    </Button>
                                    <Button onClick={() => setBriefingReport(null)} variant="ghost" size="sm" className="h-8">
                                        Edit List
                                    </Button>
                                </div>
                            </div>
                            <ScrollArea className="flex-1 border rounded-lg p-4 bg-slate-50/50">
                                <div className="prose prose-indigo max-w-none text-slate-800 text-sm py-2">
                                    <ReactMarkdown>{briefingReport}</ReactMarkdown>
                                </div>
                            </ScrollArea>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setOpen(false)}>
                                    Close Dialog
                                </Button>
                            </DialogFooter>
                        </div>
                    ) : (
                        // Form View
                        <div className="flex-1 flex flex-col overflow-hidden py-2 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden max-h-[450px]">
                                {/* Selection Panel */}
                                <div className="flex flex-col overflow-hidden border rounded-lg p-3 bg-white">
                                    <Label className="font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                                        <Users className="h-4 w-4 text-indigo-500" />
                                        1. Select Patients ({selectedIds.length} selected)
                                    </Label>
                                    <div className="relative mb-2">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                        <Input
                                            placeholder="Search patient name..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-9 h-9"
                                        />
                                    </div>
                                    <ScrollArea className="flex-1 border rounded bg-slate-50/50 p-2">
                                        {filteredPatients.length === 0 ? (
                                            <p className="text-xs text-muted-foreground text-center py-8">No patients found</p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {filteredPatients.map(patient => (
                                                    <div
                                                        key={patient.id}
                                                        onClick={() => togglePatient(patient.id)}
                                                        className="flex items-center space-x-2 p-1.5 rounded hover:bg-white hover:shadow-sm cursor-pointer transition-all border border-transparent hover:border-slate-100"
                                                    >
                                                        <Checkbox
                                                            id={`patient-${patient.id}`}
                                                            checked={selectedIds.includes(patient.id)}
                                                            onCheckedChange={() => togglePatient(patient.id)}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        <label
                                                            htmlFor={`patient-${patient.id}`}
                                                            className="text-xs font-semibold text-slate-800 cursor-pointer select-none truncate flex-1"
                                                        >
                                                            {patient.display_name}
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </div>

                                {/* Paste/Auto-Match Panel */}
                                <div className="flex flex-col border rounded-lg p-3 bg-white">
                                    <Label className="font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                                        <Sparkles className="h-4 w-4 text-amber-500" />
                                        2. Paste Schedule Names (Fast Mode)
                                    </Label>
                                    <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
                                        Paste names (one per line) from your hospital schedule list. We will auto-match and check them.
                                    </p>
                                    <Textarea
                                        placeholder="e.g.&#10;John Smith&#10;Jane Doe&#10;Michael Clark"
                                        value={pasteArea}
                                        onChange={(e) => setPasteArea(e.target.value)}
                                        className="flex-1 min-h-[150px] text-xs font-mono resize-none mb-3"
                                    />
                                    <Button
                                        onClick={handleAutoMatch}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="w-full text-xs h-9 border-slate-200 shadow-sm bg-slate-50 hover:bg-white hover:text-indigo-600 font-semibold"
                                    >
                                        Auto-Match Names
                                    </Button>
                                </div>
                            </div>

                            {selectedIds.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 border rounded-lg p-3 bg-indigo-50/50 max-h-[100px] overflow-y-auto">
                                    {selectedIds.map(id => {
                                        const p = patients.find(pat => pat.id === id);
                                        return (
                                            <div key={id} className="flex items-center gap-1 bg-white border border-indigo-100 rounded-full px-2.5 py-0.5 text-xs text-indigo-700 font-medium">
                                                <span>{p?.display_name}</span>
                                                <X
                                                    className="h-3 w-3 cursor-pointer hover:text-red-500"
                                                    onClick={() => togglePatient(id)}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <DialogFooter className="border-t pt-4">
                                <Button variant="outline" onClick={() => setOpen(false)} disabled={isGenerating}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleGenerate}
                                    disabled={isGenerating || selectedIds.length === 0}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5"
                                >
                                    {isGenerating && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {isGenerating ? 'Compiling History & Summary...' : 'Generate Scope Briefing'}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
