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
import { Plus, FileText, Mail, Loader2, Scan } from 'lucide-react';
import { createManualNote } from '@/app/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { createWorker } from 'tesseract.js';
import { getMelbourneDate } from '@/lib/date-time';

interface AddNoteDialogProps {
    patientId: string;
    asMobileButton?: boolean;
}

export function AddNoteDialog({ patientId, asMobileButton = false }: AddNoteDialogProps) {
    const [open, setOpen] = useState(false);
    const [noteType, setNoteType] = useState<'INTERNAL_NOTE' | 'REFERRER_LETTER'>('INTERNAL_NOTE');
    const [date, setDate] = useState(getMelbourneDate);
    const [content, setContent] = useState('');
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const [isOcrPending, setIsOcrPending] = useState(false);

    const processImage = async (file: File) => {
        setIsOcrPending(true);
        const toastId = toast.loading('Extracting text locally on your Mac...');
        try {
            const worker = await createWorker('eng');
            const ret = await worker.recognize(file);
            const extractedText = ret.data.text;
            await worker.terminate();

            if (!extractedText || !extractedText.trim()) {
                toast.error('No text found in image', { id: toastId });
                setIsOcrPending(false);
                return;
            }

            toast.loading('Analyzing clinical details with Gemini...', { id: toastId });

            // Call our clinical-brief API
            const response = await fetch('/api/clinical-brief', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: extractedText }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Clinical brief failed');

            const clinicalBrief = data.brief;

            // Auto populate text area
            setContent(prev => {
                const briefHeader = `Brief: ${clinicalBrief}\n\n`;
                const divider = `--- Local OCR Transcript ---\n`;
                const existing = prev ? `\n\n${prev}` : '';
                return `${briefHeader}${divider}${extractedText}${existing}`;
            });

            toast.success('Clinical note generated successfully!', { id: toastId });
        } catch (e: any) {
            console.error('OCR Error:', e);
            toast.error(`Local OCR Failed: ${e.message}`, { id: toastId });
        } finally {
            setIsOcrPending(false);
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) {
                    e.preventDefault();
                    await processImage(file);
                }
            }
        }
    };

    const handleSave = () => {
        if (!content.trim()) {
            toast.error('Please enter some content');
            return;
        }

        startTransition(async () => {
            try {
                await createManualNote(patientId, date, noteType, content.trim());
                toast.success('Note created successfully');
                setOpen(false);
                setContent('');
                setNoteType('INTERNAL_NOTE');
                setDate(getMelbourneDate());
                router.refresh();
            } catch (e: any) {
                toast.error(`Failed: ${e.message}`);
            }
        });
    };

    const triggerButton = asMobileButton ? (
        <Button variant="ghost" size="sm" className="flex-col h-auto py-2 px-3 gap-1">
            <Plus className="h-5 w-5" />
            <span className="text-[10px]">Add Note</span>
        </Button>
    ) : (
        <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Note
        </Button>
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {triggerButton}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Create New Note</DialogTitle>
                    <DialogDescription>
                        Add a new note to the patient's timeline. You can backdate the note if needed.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto px-1 py-2 space-y-4" onPaste={handlePaste}>
                    {/* Visual Screenshot OCR paste area */}
                    <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-lg p-4 bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col items-center justify-center text-center cursor-pointer group relative overflow-hidden">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) processImage(file);
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            disabled={isOcrPending || isPending}
                        />
                        {isOcrPending ? (
                            <div className="flex flex-col items-center gap-2 py-2">
                                <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                                <p className="text-sm font-semibold text-blue-600 animate-pulse">Running local Mac OCR...</p>
                                <p className="text-xs text-muted-foreground">Extracting document text completely locally</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-1.5 py-1">
                                <div className="p-2 bg-white rounded-full shadow-sm text-slate-400 group-hover:text-blue-500 group-hover:scale-110 transition-all">
                                    <Scan className="h-5 w-5" />
                                </div>
                                <p className="text-sm font-medium text-slate-700">
                                    <span className="text-blue-600 font-semibold">Paste screenshot</span> or drag & drop here
                                </p>
                                <p className="text-xs text-slate-400">Zero API-cost local OCR • JPEG, PNG</p>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="noteType">Note Type</Label>
                            <Select value={noteType} onValueChange={(v) => setNoteType(v as any)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="INTERNAL_NOTE">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4" />
                                            Internal Note
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="REFERRER_LETTER">
                                        <div className="flex items-center gap-2">
                                            <Mail className="h-4 w-4" />
                                            Referrer Letter
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="date">Date</Label>
                            <Input
                                id="date"
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="content">Content</Label>
                        <Textarea
                            id="content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder={noteType === 'INTERNAL_NOTE'
                                ? "Enter your clinical notes..."
                                : "Enter your referrer letter content..."
                            }
                            className="min-h-[300px] resize-y"
                        />
                    </div>
                </div>
                <DialogFooter className="mt-2">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isPending}>
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {isPending ? 'Creating...' : 'Create Note'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
