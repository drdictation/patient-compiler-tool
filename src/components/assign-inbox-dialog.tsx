'use client';

import { useState, useEffect } from 'react';
import { InboxItem, assignInboxItem } from '@/app/actions';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface AssignInboxDialogProps {
    item: InboxItem;
}

export function AssignInboxDialog({ item }: AssignInboxDialogProps) {
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [patients, setPatients] = useState<Array<{ id: string; display_name: string }>>([]);
    const [selectedPatientId, setSelectedPatientId] = useState<string>(item.ai_suggested_patient_id || '');
    const [assignAs, setAssignAs] = useState<'record' | 'letter' | 'task' | 'smart_note'>('record');
    const [taskCategory, setTaskCategory] = useState<'clinical' | 'administrative' | 'follow_up'>('clinical');
    const router = useRouter();

    useEffect(() => {
        if (open) {
            fetch('/api/patient/options')
                .then(async (res) => {
                    if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        throw new Error(body.error || 'Failed to load patients');
                    }

                    return res.json();
                })
                .then((data) => {
                    setPatients(data.patients || []);
                })
                .catch((error: Error) => {
                    toast.error(error.message);
                });
        }
    }, [open]);

    const handleSubmit = async () => {
        if (!selectedPatientId) {
            toast.error('Please select a patient');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await assignInboxItem(
                item.id,
                selectedPatientId,
                assignAs,
                { taskCategory }
            );

            if (result.success) {
                toast.success(`Item assigned as ${assignAs}`);
                setOpen(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Failed to assign item');
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to assign item');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="default" size="sm">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Assign to Patient</DialogTitle>
                    <DialogDescription>
                        Assign this inbox item to a patient record
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Patient Selection */}
                    <div className="space-y-2">
                        <Label>Patient</Label>
                        <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a patient..." />
                            </SelectTrigger>
                            <SelectContent>
                                {patients.map((patient) => (
                                    <SelectItem key={patient.id} value={patient.id}>
                                        {patient.display_name}
                                        {patient.id === item.ai_suggested_patient_id && (
                                            <span className="ml-2 text-xs text-green-600">(AI suggested)</span>
                                        )}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Assignment Type */}
                    <div className="space-y-3">
                        <Label>Assign as</Label>
                        <RadioGroup value={assignAs} onValueChange={(v) => setAssignAs(v as any)}>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="record" id="record" />
                                <Label htmlFor="record" className="font-normal cursor-pointer">
                                    <div>
                                        <div className="font-medium">Record</div>
                                        <div className="text-sm text-muted-foreground">
                                            Save as a raw transcript/record for this patient
                                        </div>
                                    </div>
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="letter" id="letter" />
                                <Label htmlFor="letter" className="font-normal cursor-pointer">
                                    <div>
                                        <div className="font-medium">Letter</div>
                                        <div className="text-sm text-muted-foreground">
                                            Save as a referrer letter
                                        </div>
                                    </div>
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="task" id="task" />
                                <Label htmlFor="task" className="font-normal cursor-pointer">
                                    <div>
                                        <div className="font-medium">Task</div>
                                        <div className="text-sm text-muted-foreground">
                                            Create a task from this content
                                        </div>
                                    </div>
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="smart_note" id="smart_note" />
                                <Label htmlFor="smart_note" className="font-normal cursor-pointer">
                                    <div>
                                        <div className="font-medium">Smart Note</div>
                                        <div className="text-sm text-muted-foreground">
                                            Use as transcript for Smart Note generation
                                        </div>
                                    </div>
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    {/* Task Category (only shown if assignAs === 'task') */}
                    {assignAs === 'task' && (
                        <div className="space-y-2">
                            <Label>Task Category</Label>
                            <Select value={taskCategory} onValueChange={(v) => setTaskCategory(v as any)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="clinical">Clinical</SelectItem>
                                    <SelectItem value="administrative">Administrative</SelectItem>
                                    <SelectItem value="follow_up">Follow-up</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Content Preview */}
                    <div className="space-y-2">
                        <Label>Content Preview</Label>
                        <div className="p-3 bg-muted rounded-md text-sm max-h-40 overflow-y-auto whitespace-pre-wrap">
                            {item.raw_content}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Assigning...' : 'Assign'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
