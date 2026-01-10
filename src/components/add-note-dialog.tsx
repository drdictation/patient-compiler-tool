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
import { Plus, FileText, Mail, Loader2 } from 'lucide-react';
import { createManualNote } from '@/app/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface AddNoteDialogProps {
    patientId: string;
    asMobileButton?: boolean;
}

export function AddNoteDialog({ patientId, asMobileButton = false }: AddNoteDialogProps) {
    const [open, setOpen] = useState(false);
    const [noteType, setNoteType] = useState<'INTERNAL_NOTE' | 'REFERRER_LETTER'>('INTERNAL_NOTE');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]); // Today's date
    const [content, setContent] = useState('');
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

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
                setDate(new Date().toISOString().split('T')[0]);
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
                <div className="flex-1 overflow-y-auto px-1 py-2 space-y-4">
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
