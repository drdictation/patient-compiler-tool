'use client';

import { useState, useTransition, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Pill, Check, X, AlertCircle, Clock, HelpCircle, Pencil, Trash2, Plus, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { updateInterventionState, deleteIntervention, updateIntervention, createManualIntervention } from '@/app/actions';

type Intervention = {
    id: string;
    intervention_name: string;
    intervention_type: string;
    start_date: string | null;
    end_date: string | null;
    response: 'Effective' | 'Partial' | 'Ineffective' | 'Unknown' | 'Ongoing';
    response_notes: string | null;
    lifecycle_state: 'suggested' | 'accepted' | 'rejected' | 'clinician_entered';
};

interface InterventionsPanelProps {
    patientId: string;
    interventions: Intervention[];
}

const responseConfig = {
    Effective: { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: Check },
    Partial: { color: 'bg-amber-100 text-amber-800 border-amber-200', icon: AlertCircle },
    Ineffective: { color: 'bg-red-100 text-red-800 border-red-200', icon: X },
    Ongoing: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Clock },
    Unknown: { color: 'bg-slate-100 text-slate-600 border-slate-200', icon: HelpCircle },
};

export function InterventionsPanel({ patientId, interventions: initialInterventions }: InterventionsPanelProps) {
    const [interventions, setInterventions] = useState(initialInterventions);

    // Sync state with props on server refresh
    useEffect(() => {
        setInterventions(initialInterventions);
    }, [initialInterventions]);

    const [isExtracting, setIsExtracting] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gemini-flash');
    const [isPending, startTransition] = useTransition();
    const [isOpen, setIsOpen] = useState(false);

    // Add Intervention dialog state
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [newIntName, setNewIntName] = useState('');
    const [newIntType, setNewIntType] = useState('Medication');
    const [newStartDate, setNewStartDate] = useState('');
    const [newResponse, setNewResponse] = useState<'Ongoing' | 'Effective' | 'Partial' | 'Ineffective' | 'Unknown'>('Ongoing');

    const accepted = interventions.filter(i => i.lifecycle_state === 'accepted' || i.lifecycle_state === 'clinician_entered');
    const suggested = interventions.filter(i => i.lifecycle_state === 'suggested');

    const handleExtract = async () => {
        setIsExtracting(true);
        try {
            const res = await fetch(`/api/patient/${patientId}/extract-interventions`, {
                method: 'POST',
                body: JSON.stringify({ provider: selectedModel }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Extraction failed');

            const costMsg = data.cost !== undefined ? ` (Est. Cost: $${data.cost.toFixed(4)})` : '';
            toast.success(`Found ${data.new} new interventions${costMsg}`);
            window.location.reload();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setIsExtracting(false);
        }
    };

    const handleUpdateState = async (id: string, newState: 'accepted' | 'rejected') => {
        // Optimistic update
        if (newState === 'rejected') {
            setInterventions(prev => prev.filter(int => int.id !== id));
        } else {
            setInterventions(prev => prev.map(int =>
                int.id === id ? { ...int, lifecycle_state: newState } : int
            ));
        }

        startTransition(async () => {
            try {
                await updateInterventionState(id, newState);
                toast.success(`Intervention ${newState}`);
            } catch (e: any) {
                setInterventions(initialInterventions);
                toast.error(e.message);
            }
        });
    };

    // Delete intervention
    const handleDelete = async (id: string) => {
        setInterventions(prev => prev.filter(int => int.id !== id));
        startTransition(async () => {
            try {
                await deleteIntervention(id);
                toast.success('Intervention deleted');
            } catch (e: any) {
                setInterventions(initialInterventions);
                toast.error(e.message);
            }
        });
    };

    // Update intervention
    const handleUpdate = async (id: string, updates: Partial<Intervention>) => {
        setInterventions(prev => prev.map(int =>
            int.id === id ? { ...int, ...updates } : int
        ));
        startTransition(async () => {
            try {
                await updateIntervention(id, updates as any);
                toast.success('Intervention updated');
            } catch (e: any) {
                setInterventions(initialInterventions);
                toast.error(e.message);
            }
        });
    };

    // Add new intervention
    const handleAddIntervention = async () => {
        if (!newIntName.trim()) {
            toast.error('Please enter an intervention name');
            return;
        }
        startTransition(async () => {
            try {
                await createManualIntervention(
                    patientId,
                    newIntName.trim(),
                    newIntType,
                    newStartDate || null,
                    newResponse
                );
                toast.success('Intervention added');
                setShowAddDialog(false);
                setNewIntName('');
                setNewIntType('Medication');
                setNewStartDate('');
                setNewResponse('Ongoing');
                window.location.reload();
            } catch (e: any) {
                toast.error(`Failed: ${e.message}`);
            }
        });
    };

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <Card className="mb-6 border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 bg-slate-50/50">
                    <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
                            <Pill className="h-5 w-5 text-violet-600" />
                            <CardTitle className="text-lg font-semibold text-slate-800">Interventions Tried</CardTitle>
                            {isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                        </button>
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-2">
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                            <SelectTrigger className="w-[180px] h-8 text-xs bg-white">
                                <SelectValue placeholder="Select Model" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="gemini-flash">Gemini 2.5 Flash</SelectItem>
                                <SelectItem value="groq-llama-4">Llama 4 Maverick</SelectItem>
                                <SelectItem value="groq-gpt-oss">GPT-OSS 120B</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExtract}
                            disabled={isExtracting}
                            className="h-8 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                        >
                            {isExtracting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Pill className="h-3 w-3 mr-1" />}
                            Scan Record
                        </Button>
                        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="h-8 text-xs gap-1">
                                    <Plus className="h-3 w-3" />
                                    Add
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add Intervention</DialogTitle>
                                    <DialogDescription>Manually add an intervention/treatment to the record.</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Intervention Name</Label>
                                        <Input value={newIntName} onChange={(e) => setNewIntName(e.target.value)} placeholder="e.g., Omeprazole 20mg, Endoscopy" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Type</Label>
                                            <Select value={newIntType} onValueChange={setNewIntType}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Medication">Medication</SelectItem>
                                                    <SelectItem value="Procedure">Procedure</SelectItem>
                                                    <SelectItem value="Diet">Diet</SelectItem>
                                                    <SelectItem value="Supplement">Supplement</SelectItem>
                                                    <SelectItem value="Lifestyle">Lifestyle</SelectItem>
                                                    <SelectItem value="Other">Other</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Start Date</Label>
                                            <Input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Response</Label>
                                        <Select value={newResponse} onValueChange={(v) => setNewResponse(v as any)}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Ongoing">Ongoing</SelectItem>
                                                <SelectItem value="Effective">Effective</SelectItem>
                                                <SelectItem value="Partial">Partial</SelectItem>
                                                <SelectItem value="Ineffective">Ineffective</SelectItem>
                                                <SelectItem value="Unknown">Unknown</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                                    <Button onClick={handleAddIntervention} disabled={isPending}>
                                        {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                        Add Intervention
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="pt-4">
                        {suggested.length > 0 && (
                            <div className="mb-6 p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-lg border border-violet-200 border-dashed">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-medium text-violet-900 flex items-center gap-2">
                                        <Pill className="h-3.5 w-3.5" />
                                        AI Suggestions ({suggested.length})
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50 hover:border-green-400"
                                            onClick={() => {
                                                suggested.forEach(item => handleUpdateState(item.id, 'accepted'));
                                            }}
                                            disabled={isPending}
                                        >
                                            <Check className="w-3 h-3 mr-1" />
                                            Accept All
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                                            onClick={() => {
                                                suggested.forEach(item => handleUpdateState(item.id, 'rejected'));
                                            }}
                                            disabled={isPending}
                                        >
                                            <X className="w-3 h-3 mr-1" />
                                            Reject All
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {suggested.map(item => {
                                        const config = responseConfig[item.response] || responseConfig.Unknown;
                                        const Icon = config.icon;
                                        return (
                                            <div key={item.id} className="flex items-start justify-between bg-white/80 p-3 rounded border border-violet-100 shadow-sm">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-semibold text-slate-800">{item.intervention_name}</span>
                                                        <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                                                            <Icon className="h-3 w-3 mr-1" />
                                                            {item.response}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-1">
                                                        {item.intervention_type} • {item.start_date || 'Unknown date'}
                                                        {item.end_date && ` → ${item.end_date}`}
                                                    </div>
                                                    {item.response_notes && (
                                                        <div className="text-xs text-slate-600 mt-1 italic line-clamp-2">"{item.response_notes}"</div>
                                                    )}
                                                </div>
                                                <div className="flex gap-1 ml-2 flex-shrink-0">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100"
                                                        title="Accept"
                                                        onClick={() => handleUpdateState(item.id, 'accepted')}
                                                    >
                                                        <Check className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-100"
                                                        title="Reject"
                                                        onClick={() => handleUpdateState(item.id, 'rejected')}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Accepted Interventions */}
                        {accepted.length === 0 && suggested.length === 0 && (
                            <div className="text-center text-sm text-slate-400 py-6">
                                No interventions tracked yet. Click "Scan Record" to extract from notes.
                            </div>
                        )}

                        {accepted.length > 0 && (
                            <div className="space-y-2">
                                {accepted.map(item => (
                                    <InterventionRow
                                        key={item.id}
                                        item={item}
                                        onDelete={handleDelete}
                                        onUpdate={handleUpdate}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

interface InterventionRowProps {
    item: Intervention;
    onDelete: (id: string) => void;
    onUpdate: (id: string, updates: Partial<Intervention>) => void;
}

function InterventionRow({ item, onDelete, onUpdate }: InterventionRowProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(item.intervention_name);
    const [editResponse, setEditResponse] = useState(item.response);
    const [editNotes, setEditNotes] = useState(item.response_notes || '');

    const config = responseConfig[item.response] || responseConfig.Unknown;
    const Icon = config.icon;

    const saveEdit = () => {
        onUpdate(item.id, {
            intervention_name: editName,
            response: editResponse,
            response_notes: editNotes || null,
        });
        setIsEditing(false);
    };

    return (
        <>
            <div className="group flex items-center justify-between p-3 bg-white rounded-md border border-slate-100 hover:border-slate-300 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Badge variant="secondary" className="font-mono text-[10px] min-w-[80px] justify-center flex-shrink-0">
                        {item.start_date || 'Unknown'}
                    </Badge>
                    <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{item.intervention_name}</div>
                        <div className="text-xs text-slate-500 truncate">{item.intervention_type}</div>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                        <Icon className="h-3 w-3 mr-1" />
                        {item.response}
                    </Badge>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-blue-600" onClick={() => setIsEditing(true)} title="Edit">
                            <Pencil className="w-3 h-3" />
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" title="Delete">
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Intervention</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Are you sure you want to delete "{item.intervention_name}"? This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDelete(item.id)} className="bg-red-600 hover:bg-red-700">
                                        Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            </div>

            {/* Edit Dialog */}
            <Dialog open={isEditing} onOpenChange={setIsEditing}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Intervention</DialogTitle>
                        <DialogDescription>Update the intervention details below.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="intName">Intervention Name</Label>
                            <Input id="intName" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="response">Response</Label>
                            <Select value={editResponse} onValueChange={(v) => setEditResponse(v as any)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Effective">Effective</SelectItem>
                                    <SelectItem value="Partial">Partial</SelectItem>
                                    <SelectItem value="Ineffective">Ineffective</SelectItem>
                                    <SelectItem value="Ongoing">Ongoing</SelectItem>
                                    <SelectItem value="Unknown">Unknown</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">Response Notes</Label>
                            <Input id="notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Optional notes..." />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                        <Button onClick={saveEdit}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
