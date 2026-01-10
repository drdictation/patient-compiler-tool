'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2, UserPlus } from 'lucide-react';
import { createPatient } from '@/app/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export function AddPatientDialog() {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const handleCreate = () => {
        if (!name.trim()) {
            toast.error('Please enter a patient name');
            return;
        }

        startTransition(async () => {
            try {
                const result = await createPatient(name.trim());
                toast.success(`Patient "${name.trim()}" created`);
                setOpen(false);
                setName('');
                // Navigate to the new patient page
                router.push(`/patient/${result.id}`);
            } catch (e: any) {
                toast.error(`Failed: ${e.message}`);
            }
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isPending && name.trim()) {
            handleCreate();
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="icon" variant="outline" title="Add New Patient">
                    <Plus className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-blue-500" />
                        Add New Patient
                    </DialogTitle>
                    <DialogDescription>
                        Create a new patient record. You can add notes and records after.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="patientName">Patient Name</Label>
                    <Input
                        id="patientName"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="e.g. John Smith"
                        className="mt-2"
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={isPending || !name.trim()}>
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {isPending ? 'Creating...' : 'Create Patient'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
