
'use client';

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function PatientRowActions({ patientId, patientName }: { patientId: string, patientName: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        // Prevent clicking the row
        e.preventDefault();
        e.stopPropagation();

        if (!confirm(`Are you sure you want to delete ${patientName}? This will delete ALL history and records for this patient.`)) {
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/patient/${patientId}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Failed to delete');

            toast.success('Patient deleted');
            router.refresh();
        } catch (error) {
            toast.error('Error deleting patient');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex justify-end gap-2">
            <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={handleDelete}
                disabled={loading}
                title="Delete Patient"
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );
}
