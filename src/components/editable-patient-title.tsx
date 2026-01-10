
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface EditablePatientTitleProps {
    patientId: string;
    initialName: string;
}

export function EditablePatientTitle({ patientId, initialName }: EditablePatientTitleProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(initialName);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    const handleSave = async () => {
        if (name.trim() === initialName) {
            setIsEditing(false);
            return;
        }

        if (name.trim().length === 0) {
            toast.error("Name cannot be empty");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/patient/${patientId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: name }),
            });

            if (!res.ok) throw new Error('Failed to update name');

            toast.success("Patient name updated");
            setIsEditing(false);
            router.refresh();
        } catch (err) {
            toast.error("Error updating name");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') {
            setName(initialName);
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <div className="flex items-center gap-2">
                <Input
                    ref={inputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="h-9 text-lg font-bold min-w-[300px]"
                    disabled={loading}
                />
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                    onClick={handleSave}
                    disabled={loading}
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                    onClick={() => {
                        setName(initialName);
                        setIsEditing(false);
                    }}
                    disabled={loading}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <div
            className="group flex items-center gap-3 cursor-pointer py-1 -ml-2 px-2 rounded hover:bg-slate-100 transition-colors"
            onClick={() => setIsEditing(true)}
            title="Click to rename"
        >
            <h1 className="text-2xl font-bold text-slate-900">
                {initialName}
            </h1>
            <Pencil className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
    );
}
