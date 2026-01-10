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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Loader2, Microscope, CalendarClock, Beaker, Check, X, Pencil, Trash2, Plus, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { updateInvestigationState, deleteInvestigation, updateInvestigation, createManualInvestigation } from '@/app/actions';

type Investigation = {
    id: string;
    test_name: string;
    test_category: string;
    test_date: string | null;
    result_summary: string | null;
    status: 'Completed' | 'Planned' | 'Pending';
    next_due_date: string | null;
    lifecycle_state: 'suggested' | 'accepted' | 'rejected' | 'clinician_entered';
};

interface InvestigationsPanelProps {
    patientId: string;
    investigations: Investigation[];
}

export function InvestigationsPanel({ patientId, investigations: initialInvestigations }: InvestigationsPanelProps) {
    const [investigations, setInvestigations] = useState(initialInvestigations);

    // Sync state with props on server refresh
    useEffect(() => {
        setInvestigations(initialInvestigations);
    }, [initialInvestigations]);

    const [isExtracting, setIsExtracting] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gemini-flash');
    const [isPending, startTransition] = useTransition();
    const [isOpen, setIsOpen] = useState(false);

    // Add Investigation dialog state
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [newTestName, setNewTestName] = useState('');
    const [newTestCategory, setNewTestCategory] = useState('Blood');
    const [newTestDate, setNewTestDate] = useState('');
    const [newResultSummary, setNewResultSummary] = useState('');

    const accepted = investigations.filter(i => i.lifecycle_state === 'accepted' || i.lifecycle_state === 'clinician_entered');
    const suggested = investigations.filter(i => i.lifecycle_state === 'suggested');

    // Optimistic update
    const handleUpdateState = async (id: string, newState: 'accepted' | 'rejected') => {
        // Optimistically update
        if (newState === 'rejected') {
            setInvestigations(prev => prev.filter(inv => inv.id !== id));
        } else {
            setInvestigations(prev => prev.map(inv =>
                inv.id === id ? { ...inv, lifecycle_state: newState } : inv
            ));
        }

        startTransition(async () => {
            try {
                await updateInvestigationState(id, newState);
                toast.success(`Investigation ${newState}`);
            } catch (e: any) {
                // Revert on error
                setInvestigations(initialInvestigations);
                toast.error(e.message);
            }
        });
    };

    const handleExtract = async () => {
        setIsExtracting(true);
        try {
            const res = await fetch(`/api/patient/${patientId}/extract-investigations`, {
                method: 'POST',
                body: JSON.stringify({ provider: selectedModel }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Extraction failed');

            const costMsg = data.cost !== undefined ? ` (Est. Cost: $${data.cost.toFixed(4)})` : '';
            toast.success(`Found ${data.new} new tests${costMsg}`);
            window.location.reload();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setIsExtracting(false);
        }
    };

    // Delete investigation
    const handleDelete = async (id: string) => {
        setInvestigations(prev => prev.filter(inv => inv.id !== id));
        startTransition(async () => {
            try {
                await deleteInvestigation(id);
                toast.success('Investigation deleted');
            } catch (e: any) {
                setInvestigations(initialInvestigations);
                toast.error(e.message);
            }
        });
    };

    // Update investigation
    const handleUpdate = async (id: string, updates: Partial<Investigation>) => {
        setInvestigations(prev => prev.map(inv =>
            inv.id === id ? { ...inv, ...updates } : inv
        ));
        startTransition(async () => {
            try {
                await updateInvestigation(id, updates as any);
                toast.success('Investigation updated');
            } catch (e: any) {
                setInvestigations(initialInvestigations);
                toast.error(e.message);
            }
        });
    };

    // Add new investigation
    const handleAddInvestigation = async () => {
        if (!newTestName.trim()) {
            toast.error('Please enter a test name');
            return;
        }
        startTransition(async () => {
            try {
                await createManualInvestigation(
                    patientId,
                    newTestName.trim(),
                    newTestCategory,
                    newTestDate || null,
                    newResultSummary
                );
                toast.success('Investigation added');
                setShowAddDialog(false);
                setNewTestName('');
                setNewTestCategory('Blood');
                setNewTestDate('');
                setNewResultSummary('');
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
                            <Microscope className="h-5 w-5 text-indigo-600" />
                            <CardTitle className="text-lg font-semibold text-slate-800">Investigations Tracker</CardTitle>
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
                            className="h-8 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                        >
                            {isExtracting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Beaker className="h-3 w-3 mr-1" />}
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
                                    <DialogTitle>Add Investigation</DialogTitle>
                                    <DialogDescription>Manually add an investigation/test to the record.</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Test Name</Label>
                                        <Input value={newTestName} onChange={(e) => setNewTestName(e.target.value)} placeholder="e.g., FBC, LFTs, CT Abdomen" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Category</Label>
                                            <Select value={newTestCategory} onValueChange={setNewTestCategory}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Blood">Blood</SelectItem>
                                                    <SelectItem value="Endoscopy">Endoscopy</SelectItem>
                                                    <SelectItem value="Imaging">Imaging</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Date</Label>
                                            <Input type="date" value={newTestDate} onChange={(e) => setNewTestDate(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Result Summary</Label>
                                        <Input value={newResultSummary} onChange={(e) => setNewResultSummary(e.target.value)} placeholder="Optional summary..." />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                                    <Button onClick={handleAddInvestigation} disabled={isPending}>
                                        {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                        Add Investigation
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="pt-4">
                        {suggested.length > 0 && (
                            <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200 border-dashed">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-medium text-amber-900 flex items-center gap-2">
                                        <Beaker className="h-3.5 w-3.5" />
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
                                    {suggested.map(item => (
                                        <div key={item.id} className="flex items-start justify-between bg-white/80 p-3 rounded border border-amber-100 shadow-sm">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-slate-800">{item.test_name}</div>
                                                <div className="text-xs text-slate-500">
                                                    {item.test_date || 'No Date'} • {item.test_category}
                                                    {item.next_due_date && <span className="ml-2 text-amber-600 font-medium">Recall: {item.next_due_date}</span>}
                                                </div>
                                                {item.result_summary && (
                                                    <div className="text-xs text-slate-600 mt-1 italic line-clamp-2">"{item.result_summary}"</div>
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
                                    ))}
                                </div>
                            </div>
                        )}

                        <Tabs defaultValue="endoscopy" className="w-full">
                            <TabsList className="grid w-full grid-cols-3 mb-4">
                                <TabsTrigger value="endoscopy">Endoscopy</TabsTrigger>
                                <TabsTrigger value="imaging">Imaging</TabsTrigger>
                                <TabsTrigger value="surveillance">Recall / Due</TabsTrigger>
                            </TabsList>

                            <TabsContent value="endoscopy" className="space-y-2">
                                {accepted.filter(i => i.test_category === 'Endoscopy').length === 0 && <div className="text-center text-sm text-slate-400 py-4">No endoscopy records.</div>}
                                {accepted.filter(i => i.test_category === 'Endoscopy').map(item => (
                                    <InvestigationRow key={item.id} item={item} onDelete={handleDelete} onUpdate={handleUpdate} />
                                ))}
                            </TabsContent>

                            <TabsContent value="imaging" className="space-y-2">
                                {accepted.filter(i => i.test_category === 'Imaging').length === 0 && <div className="text-center text-sm text-slate-400 py-4">No imaging records.</div>}
                                {accepted.filter(i => i.test_category === 'Imaging').map(item => (
                                    <InvestigationRow key={item.id} item={item} onDelete={handleDelete} onUpdate={handleUpdate} />
                                ))}
                            </TabsContent>

                            <TabsContent value="surveillance" className="space-y-2">
                                {accepted.filter(i => i.next_due_date).length === 0 && <div className="text-center text-sm text-slate-400 py-4">No upcoming recall dates.</div>}
                                {accepted.filter(i => i.next_due_date).map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-3 bg-white rounded-md border border-slate-200">
                                        <div>
                                            <div className="font-medium text-slate-800">{item.test_name}</div>
                                            <div className="text-xs text-slate-500">Last: {item.test_date}</div>
                                        </div>
                                        <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700 flex items-center gap-1">
                                            <CalendarClock className="h-3 w-3" />
                                            Due: {item.next_due_date}
                                        </Badge>
                                    </div>
                                ))}
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

interface InvestigationRowProps {
    item: Investigation;
    onDelete: (id: string) => void;
    onUpdate: (id: string, updates: Partial<Investigation>) => void;
}

function InvestigationRow({ item, onDelete, onUpdate }: InvestigationRowProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(item.test_name);
    const [editStatus, setEditStatus] = useState(item.status);
    const [editDueDate, setEditDueDate] = useState(item.next_due_date || '');

    const saveEdit = () => {
        onUpdate(item.id, {
            test_name: editName,
            status: editStatus,
            next_due_date: editDueDate || null,
        });
        setIsEditing(false);
    };

    return (
        <>
            <div className="group flex items-center justify-between p-3 bg-white rounded-md border border-slate-100 hover:border-slate-300 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Badge variant="secondary" className="font-mono text-[10px] min-w-[80px] justify-center flex-shrink-0">
                        {item.test_date || 'Unknown'}
                    </Badge>
                    <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{item.test_name}</div>
                        <div className="text-xs text-slate-500 truncate">{item.result_summary}</div>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={item.status === 'Completed' ? 'default' : 'outline'} className="text-[10px]">
                        {item.status}
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
                                    <AlertDialogTitle>Delete Investigation</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Are you sure you want to delete "{item.test_name}"? This action cannot be undone.
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
                        <DialogTitle>Edit Investigation</DialogTitle>
                        <DialogDescription>Update the investigation details below.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="testName">Test Name</Label>
                            <Input id="testName" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select value={editStatus} onValueChange={(v) => setEditStatus(v as any)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Completed">Completed</SelectItem>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Planned">Planned</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dueDate">Next Due Date</Label>
                            <Input id="dueDate" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
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
