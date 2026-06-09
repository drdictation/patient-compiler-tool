'use client';

import { useState, useTransition, useEffect } from 'react';
import { PatientIssue } from '@/lib/data';
import { updateIssueState, updateIssueStatus, createManualIssue, deleteIssue, updateIssue } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Loader2, Sparkles, Check, X, Plus,
    ArrowRight, AlertCircle, RefreshCw, Pencil, Trash2, ChevronDown
} from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';

interface IssuesPanelProps {
    patientId: string;
    issues: PatientIssue[];
}

export function IssuesPanel({ patientId, issues: initialIssues }: IssuesPanelProps) {
    const [issues, setIssues] = useState(initialIssues);

    // Sync state with props on server refresh
    useEffect(() => {
        setIssues(initialIssues);
    }, [initialIssues]);

    const [isExtracting, setIsExtracting] = useState(false);
    const [model, setModel] = useState('gemini-flash');
    const [isPending, startTransition] = useTransition();
    const [isOpen, setIsOpen] = useState(false);

    // Add Issue dialog state
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [newIssueName, setNewIssueName] = useState('');
    const [newIssueStatus, setNewIssueStatus] = useState<'active' | 'monitoring' | 'resolved'>('active');

    const acceptedIssues = issues.filter(i => i.lifecycle_state === 'accepted' || i.lifecycle_state === 'clinician_entered');
    const suggestedIssues = issues.filter(i => i.lifecycle_state === 'suggested');

    const activeIssues = acceptedIssues.filter(i => i.status === 'active');
    const monitoringIssues = acceptedIssues.filter(i => i.status === 'monitoring');
    const resolvedIssues = acceptedIssues.filter(i => i.status === 'resolved');

    // Optimistic update for lifecycle state (accept/reject)
    async function handleStateChange(issueId: string, newState: 'accepted' | 'rejected') {
        // Optimistically update local state
        setIssues(prev => prev.map(issue =>
            issue.id === issueId
                ? { ...issue, lifecycle_state: newState }
                : issue
        ));

        // If rejected, we can filter it out entirely for cleaner UI
        if (newState === 'rejected') {
            setIssues(prev => prev.filter(issue => issue.id !== issueId));
        }

        // Call server in background
        startTransition(async () => {
            try {
                await updateIssueState(issueId, newState);
                toast.success(newState === 'accepted' ? 'Issue accepted' : 'Issue rejected');
            } catch (e: any) {
                // Revert on error
                setIssues(initialIssues);
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    // Optimistic update for status change (active/monitoring/resolved)
    async function handleStatusChange(issueId: string, newStatus: 'active' | 'monitoring' | 'resolved') {
        setIssues(prev => prev.map(issue =>
            issue.id === issueId
                ? { ...issue, status: newStatus }
                : issue
        ));

        startTransition(async () => {
            try {
                await updateIssueStatus(issueId, newStatus);
            } catch (e: any) {
                setIssues(initialIssues);
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    async function handleExtract() {
        setIsExtracting(true);
        try {
            const res = await fetch(`/api/patient/${patientId}/extract-issues`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: model })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Extraction failed');

            const costMsg = data.cost !== undefined ? ` (Est. Cost: $${data.cost.toFixed(4)})` : '';
            toast.success(`Found ${data.new} new issues, ${data.existing} existing updated.${costMsg}`);

            // Reload to get new issues (extraction creates new DB rows)
            window.location.reload();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setIsExtracting(false);
        }
    }

    // Delete an issue
    async function handleDelete(issueId: string) {
        // Optimistic update
        setIssues(prev => prev.filter(issue => issue.id !== issueId));

        startTransition(async () => {
            try {
                await deleteIssue(issueId);
                toast.success('Issue deleted');
            } catch (e: any) {
                setIssues(initialIssues);
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    // Update issue name
    async function handleUpdate(issueId: string, newName: string) {
        // Optimistic update
        setIssues(prev => prev.map(issue =>
            issue.id === issueId
                ? { ...issue, issue_name: newName }
                : issue
        ));

        startTransition(async () => {
            try {
                await updateIssue(issueId, { issue_name: newName });
                toast.success('Issue updated');
            } catch (e: any) {
                setIssues(initialIssues);
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    // Add new issue manually
    async function handleAddIssue() {
        if (!newIssueName.trim()) {
            toast.error('Please enter an issue name');
            return;
        }

        startTransition(async () => {
            try {
                await createManualIssue(patientId, newIssueName.trim(), newIssueStatus);
                toast.success('Issue added');
                setShowAddDialog(false);
                setNewIssueName('');
                setNewIssueStatus('active');
                window.location.reload();
            } catch (e: any) {
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-indigo-600" />
                                Problem List
                                {isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                            </h3>
                        </button>
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-2">
                        <Select value={model} onValueChange={setModel} disabled={isExtracting}>
                            <SelectTrigger className="w-[180px] h-8 text-xs">
                                <SelectValue placeholder="Select Model" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="gemini-flash">Gemini 2.5 Flash</SelectItem>
                                <SelectItem value="gemini-flash-lite">Gemini 3.1 Flash-Lite</SelectItem>
                                <SelectItem value="groq-gpt-oss">GPT-OSS 120B (Groq)</SelectItem>
                                <SelectItem value="groq-llama-4">Llama 4 Scout (Groq)</SelectItem>
                                <SelectItem value="groq-llama-3">Llama 3 70B (Groq)</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExtract}
                            disabled={isExtracting}
                            className="gap-2 h-8"
                        >
                            {isExtracting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                            )}
                            {isExtracting ? 'Scanning...' : 'Scan Record'}
                        </Button>
                        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="gap-2 h-8">
                                    <Plus className="w-3.5 h-3.5" />
                                    Add Issue
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add New Issue</DialogTitle>
                                    <DialogDescription>Manually add a problem to the patient's record.</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Issue Name</label>
                                        <Input
                                            value={newIssueName}
                                            onChange={(e) => setNewIssueName(e.target.value)}
                                            placeholder="e.g., Hypertension, Type 2 Diabetes"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Status</label>
                                        <Select value={newIssueStatus} onValueChange={(v) => setNewIssueStatus(v as any)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="monitoring">Monitoring</SelectItem>
                                                <SelectItem value="resolved">Resolved</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                                    <Button onClick={handleAddIssue} disabled={isPending}>
                                        {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                        Add Issue
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                <CollapsibleContent>
                    {/* SUGGESTIONS */}
                    {suggestedIssues.length > 0 && (
                        <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-lg p-4 border border-indigo-200 border-dashed mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                                    <Sparkles className="w-3 h-3" />
                                    AI Suggestions ({suggestedIssues.length})
                                </h4>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50 hover:border-green-400"
                                        onClick={() => {
                                            suggestedIssues.forEach(issue => handleStateChange(issue.id, 'accepted'));
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
                                            suggestedIssues.forEach(issue => handleStateChange(issue.id, 'rejected'));
                                        }}
                                        disabled={isPending}
                                    >
                                        <X className="w-3 h-3 mr-1" />
                                        Reject All
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {suggestedIssues.map(issue => (
                                    <div key={issue.id} className="flex items-start justify-between bg-white/80 p-3 rounded-md shadow-sm border border-indigo-100">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm text-gray-900">{issue.issue_name}</div>
                                            {issue.evidence_quote && (
                                                <div className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                                                    "{issue.evidence_quote}"
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100"
                                                title="Accept"
                                                onClick={() => handleStateChange(issue.id, 'accepted')}
                                            >
                                                <Check className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-7 w-7 text-red-400 hover:text-red-500 hover:bg-red-100"
                                                title="Reject"
                                                onClick={() => handleStateChange(issue.id, 'rejected')}
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ACTIVE LIST */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <IssueColumn title="Active" color="text-gray-900" issues={activeIssues} onStatusChange={handleStatusChange} onDelete={handleDelete} onUpdate={handleUpdate} />
                        <IssueColumn title="Monitoring" color="text-amber-700" issues={monitoringIssues} onStatusChange={handleStatusChange} onDelete={handleDelete} onUpdate={handleUpdate} />
                        <IssueColumn title="Resolved" color="text-green-700" issues={resolvedIssues} onStatusChange={handleStatusChange} onDelete={handleDelete} onUpdate={handleUpdate} />
                    </div>

                    {issues.length === 0 && (
                        <div className="text-center py-8 text-sm text-muted-foreground italic">
                            No issues tracked. Click "Scan Record" to extract from dictations.
                        </div>
                    )}
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}

interface IssueColumnProps {
    title: string;
    color: string;
    issues: PatientIssue[];
    onStatusChange: (id: string, status: 'active' | 'monitoring' | 'resolved') => void;
    onDelete: (id: string) => void;
    onUpdate: (id: string, name: string) => void;
}

function IssueColumn({ title, color, issues, onStatusChange, onDelete, onUpdate }: IssueColumnProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const startEdit = (issue: PatientIssue) => {
        setEditingId(issue.id);
        setEditName(issue.issue_name);
    };

    const saveEdit = () => {
        if (editingId && editName.trim()) {
            onUpdate(editingId, editName.trim());
            setEditingId(null);
        }
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditName('');
    };

    return (
        <div className="space-y-3">
            <h4 className={`text-xs font-bold uppercase tracking-wider border-b pb-1 ${color}`}>
                {title} ({issues.length})
            </h4>
            <div className="space-y-2">
                {issues.map(issue => (
                    <div key={issue.id} className="group flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 -mx-2 transition-colors">
                        {editingId === issue.id ? (
                            // Edit mode
                            <div className="flex-1 flex items-center gap-2">
                                <Input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="h-7 text-sm flex-1"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEdit();
                                        if (e.key === 'Escape') cancelEdit();
                                    }}
                                />
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600" onClick={saveEdit}>
                                    <Check className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400" onClick={cancelEdit}>
                                    <X className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        ) : (
                            // View mode
                            <>
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-sm font-medium leading-none truncate">{issue.issue_name}</span>
                                    {issue.source_count && issue.source_count > 0 && (
                                        <Badge variant="secondary" className="text-[10px] h-4 px-1 text-muted-foreground font-normal flex-shrink-0">
                                            {issue.source_count}
                                        </Badge>
                                    )}
                                </div>
                                {/* Hover Actions */}
                                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity flex-shrink-0">
                                    {title !== 'Active' && (
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onStatusChange(issue.id, 'active')} title="Move to Active">
                                            <ArrowRight className="w-3 h-3 rotate-180" />
                                        </Button>
                                    )}
                                    {title !== 'Resolved' && (
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onStatusChange(issue.id, 'resolved')} title="Resolve">
                                            <Check className="w-3 h-3" />
                                        </Button>
                                    )}
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-blue-600" onClick={() => startEdit(issue)} title="Edit">
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
                                                <AlertDialogTitle>Delete Issue</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Are you sure you want to delete "{issue.issue_name}"? This action cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => onDelete(issue.id)}
                                                    className="bg-red-600 hover:bg-red-700"
                                                >
                                                    Delete
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
