'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { PatientDetails } from "@/lib/data";
import { updatePatientDetails } from "@/app/actions";
import { toast } from "sonner";
import { UserCog } from "lucide-react";

interface PatientInfoToggleProps {
    patient: PatientDetails;
    asMobileButton?: boolean;
}

export function PatientInfoToggle({ patient, asMobileButton = false }: PatientInfoToggleProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<PatientDetails>>({
        date_of_birth: patient.date_of_birth || '',
        medicare_number: patient.medicare_number || '',
        address: patient.address || '',
        ihi_number: patient.ihi_number || '',
        referring_doctor: patient.referring_doctor || '',
        next_recall_date: patient.next_recall_date || '',
        mobile: patient.mobile || '',
        email: patient.email || '',
        dva_number: patient.dva_number || '',
        private_health_number: patient.private_health_number || '',
        notes: patient.notes || ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            // Clean empty strings to null for dates/numbers if needed, but Supabase handles text fine.
            // For dates, empty string might fail date type validation.
            const cleanData = { ...formData };
            if (cleanData.date_of_birth === '') cleanData.date_of_birth = null;
            if (cleanData.next_recall_date === '') cleanData.next_recall_date = null;

            await updatePatientDetails(patient.id, cleanData);
            toast.success("Patient details updated");
            setOpen(false);
        } catch (e: any) {
            console.error(e);
            toast.error("Failed to update details: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const triggerButton = asMobileButton ? (
        <Button variant="ghost" size="sm" className="flex-col h-auto py-2 px-3 gap-1">
            <UserCog className="h-5 w-5" />
            <span className="text-[10px]">Details</span>
        </Button>
    ) : (
        <Button variant="outline" size="sm" className="gap-2">
            <UserCog className="h-4 w-4" />
            Patient Details
        </Button>
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                {triggerButton}
            </PopoverTrigger>
            <PopoverContent className="w-[600px] p-6" align="start">
                <div className="grid gap-6">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none text-lg">Patient Administration</h4>
                        <p className="text-sm text-muted-foreground">
                            Manage demographics and clinical metadata.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Left Column: Admin */}
                        <div className="space-y-4">
                            <h5 className="font-semibold text-sm border-b pb-1">Demographics</h5>

                            <div className="grid gap-2">
                                <Label htmlFor="date_of_birth">Date of Birth</Label>
                                <Input
                                    id="date_of_birth"
                                    name="date_of_birth"
                                    type="date"
                                    value={formData.date_of_birth || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="mobile">Mobile</Label>
                                <Input id="mobile" name="mobile" value={formData.mobile || ''} onChange={handleChange} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" name="email" value={formData.email || ''} onChange={handleChange} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="address">Address</Label>
                                <Textarea id="address" name="address" rows={2} value={formData.address || ''} onChange={handleChange} />
                            </div>
                        </div>

                        {/* Right Column: Numbers & Clinical */}
                        <div className="space-y-4">
                            <h5 className="font-semibold text-sm border-b pb-1">Identifiers & Clinical</h5>

                            <div className="grid gap-2">
                                <Label htmlFor="medicare_number">Medicare Number</Label>
                                <Input id="medicare_number" name="medicare_number" value={formData.medicare_number || ''} onChange={handleChange} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="referring_doctor">Referring Doctor</Label>
                                <Input id="referring_doctor" name="referring_doctor" value={formData.referring_doctor || ''} onChange={handleChange} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="next_recall_date">Next Recall Date</Label>
                                <Input
                                    id="next_recall_date"
                                    name="next_recall_date"
                                    type="date"
                                    value={formData.next_recall_date || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="ihi_number">IHI</Label>
                                    <Input id="ihi_number" name="ihi_number" value={formData.ihi_number || ''} onChange={handleChange} />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="dva_number">DVA</Label>
                                    <Input id="dva_number" name="dva_number" value={formData.dva_number || ''} onChange={handleChange} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={loading}>
                            {loading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
