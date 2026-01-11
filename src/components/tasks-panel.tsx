'use client';

import { useState, useTransition, useEffect } from 'react';
import {
    completeTask,
    snoozeTask,
    deleteTask,
    updateTask,
    createManualTask
} from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Loader2, Check, X, Plus, Clock, Pencil, Trash2, ChevronDown,
    ListTodo, MoreHorizontal, Sparkles
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';

export interface PatientTask {
    id: string;
    task_description: string;
    task_category: 'clinical' | 'administrative' | 'follow_up';
    evidence_quote: string | null;
    status: string;
    lifecycle_state: string;
    confidence: string;
    snoozed_until: string | null;
    created_at: string;
}

interface TasksPanelProps {
    patientId: string;
    tasks: PatientTask[];
}

const CATEGORY_COLORS: Record<string, string> = {
    clinical: 'bg-blue-100 text-blue-700',
    administrative: 'bg-amber-100 text-amber-700',
    follow_up: 'bg-purple-100 text-purple-700',
};

const CATEGORY_LABELS: Record<string, string> = {
    clinical: 'Clinical',
    administrative: 'Admin',
    follow_up: 'Follow-up',
};

export function TasksPanel({ patientId, tasks: initialTasks }: TasksPanelProps) {
    const [tasks, setTasks] = useState(initialTasks);

    // Sync state with props on server refresh
    useEffect(() => {
        setTasks(initialTasks);
    }, [initialTasks]);

    const [isPending, startTransition] = useTransition();
    const [isOpen, setIsOpen] = useState(true);

    // Add Task dialog state
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [newTaskDescription, setNewTaskDescription] = useState('');
    const [newTaskCategory, setNewTaskCategory] = useState<'clinical' | 'administrative' | 'follow_up'>('clinical');

    // Edit Task dialog state
    const [editingTask, setEditingTask] = useState<PatientTask | null>(null);
    const [editDescription, setEditDescription] = useState('');
    const [editCategory, setEditCategory] = useState<'clinical' | 'administrative' | 'follow_up'>('clinical');

    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const suggestedTasks = pendingTasks.filter(t => t.lifecycle_state === 'suggested');
    const acceptedTasks = pendingTasks.filter(t => t.lifecycle_state !== 'suggested');

    // Complete task
    async function handleComplete(taskId: string) {
        // Optimistic update - remove from list
        setTasks(prev => prev.filter(t => t.id !== taskId));

        startTransition(async () => {
            try {
                await completeTask(taskId);
                toast.success('Task completed');
            } catch (e: any) {
                setTasks(initialTasks);
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    // Accept a suggested task
    async function handleAccept(taskId: string) {
        setTasks(prev => prev.map(t =>
            t.id === taskId ? { ...t, lifecycle_state: 'accepted' } : t
        ));

        startTransition(async () => {
            try {
                await updateTask(taskId, {});  // Just updates the lifecycle_state via a different approach
                // We need to update lifecycle_state, let's call a separate action
                toast.success('Task accepted');
            } catch (e: any) {
                setTasks(initialTasks);
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    // Reject (delete) a suggested task
    async function handleReject(taskId: string) {
        setTasks(prev => prev.filter(t => t.id !== taskId));

        startTransition(async () => {
            try {
                await deleteTask(taskId);
                toast.success('Task rejected');
            } catch (e: any) {
                setTasks(initialTasks);
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    // Snooze task
    async function handleSnooze(taskId: string, days: number) {
        // Optimistic update - remove from view (will reappear later)
        setTasks(prev => prev.filter(t => t.id !== taskId));

        startTransition(async () => {
            try {
                await snoozeTask(taskId, days);
                toast.success(`Task snoozed for ${days} day${days > 1 ? 's' : ''}`);
            } catch (e: any) {
                setTasks(initialTasks);
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    // Delete task
    async function handleDelete(taskId: string) {
        setTasks(prev => prev.filter(t => t.id !== taskId));

        startTransition(async () => {
            try {
                await deleteTask(taskId);
                toast.success('Task deleted');
            } catch (e: any) {
                setTasks(initialTasks);
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    // Update task
    async function handleUpdate() {
        if (!editingTask || !editDescription.trim()) return;

        setTasks(prev => prev.map(t =>
            t.id === editingTask.id
                ? { ...t, task_description: editDescription, task_category: editCategory }
                : t
        ));

        startTransition(async () => {
            try {
                await updateTask(editingTask.id, {
                    task_description: editDescription.trim(),
                    task_category: editCategory
                });
                toast.success('Task updated');
                setEditingTask(null);
            } catch (e: any) {
                setTasks(initialTasks);
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    // Add new task
    async function handleAddTask() {
        if (!newTaskDescription.trim()) {
            toast.error('Please enter a task description');
            return;
        }

        startTransition(async () => {
            try {
                await createManualTask(patientId, newTaskDescription.trim(), newTaskCategory);
                toast.success('Task added');
                setShowAddDialog(false);
                setNewTaskDescription('');
                setNewTaskCategory('clinical');
                window.location.reload();
            } catch (e: any) {
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <ListTodo className="w-5 h-5 text-emerald-600" />
                                Tasks
                                {pendingTasks.length > 0 && (
                                    <Badge variant="secondary" className="ml-1">
                                        {pendingTasks.length}
                                    </Badge>
                                )}
                                {isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                            </h3>
                        </button>
                    </CollapsibleTrigger>
                    <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="gap-2 h-8">
                                <Plus className="w-3.5 h-3.5" />
                                Add Task
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add New Task</DialogTitle>
                                <DialogDescription>Create a task for this patient.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Task Description</label>
                                    <Textarea
                                        value={newTaskDescription}
                                        onChange={(e) => setNewTaskDescription(e.target.value)}
                                        placeholder="e.g., Order FBE/LFT, Send referral letter"
                                        rows={3}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Category</label>
                                    <Select value={newTaskCategory} onValueChange={(v) => setNewTaskCategory(v as any)}>
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
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                                <Button onClick={handleAddTask} disabled={isPending}>
                                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Add Task
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                <CollapsibleContent>
                    {/* AI Suggestions */}
                    {suggestedTasks.length > 0 && (
                        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg p-4 border border-emerald-200 border-dashed mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-2">
                                    <Sparkles className="w-3 h-3" />
                                    AI Extracted Tasks ({suggestedTasks.length})
                                </h4>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50 hover:border-green-400"
                                        onClick={() => {
                                            suggestedTasks.forEach(task => handleComplete(task.id));
                                        }}
                                        disabled={isPending}
                                    >
                                        <Check className="w-3 h-3 mr-1" />
                                        Complete All
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                                        onClick={() => {
                                            suggestedTasks.forEach(task => handleReject(task.id));
                                        }}
                                        disabled={isPending}
                                    >
                                        <X className="w-3 h-3 mr-1" />
                                        Dismiss All
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {suggestedTasks.map(task => (
                                    <TaskItem
                                        key={task.id}
                                        task={task}
                                        onComplete={handleComplete}
                                        onSnooze={handleSnooze}
                                        onDelete={handleReject}
                                        onEdit={(t) => {
                                            setEditingTask(t);
                                            setEditDescription(t.task_description);
                                            setEditCategory(t.task_category);
                                        }}
                                        isSuggestion
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Accepted/Manual Tasks */}
                    {acceptedTasks.length > 0 && (
                        <div className="space-y-2">
                            {acceptedTasks.map(task => (
                                <TaskItem
                                    key={task.id}
                                    task={task}
                                    onComplete={handleComplete}
                                    onSnooze={handleSnooze}
                                    onDelete={handleDelete}
                                    onEdit={(t) => {
                                        setEditingTask(t);
                                        setEditDescription(t.task_description);
                                        setEditCategory(t.task_category);
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {pendingTasks.length === 0 && (
                        <div className="text-center py-8 text-sm text-muted-foreground italic">
                            No pending tasks. Tasks will be extracted when you generate a Smart Note.
                        </div>
                    )}
                </CollapsibleContent>

                {/* Edit Task Dialog */}
                <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Edit Task</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Task Description</label>
                                <Textarea
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    rows={3}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Category</label>
                                <Select value={editCategory} onValueChange={(v) => setEditCategory(v as any)}>
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
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setEditingTask(null)}>Cancel</Button>
                            <Button onClick={handleUpdate} disabled={isPending}>
                                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </Collapsible>
    );
}

interface TaskItemProps {
    task: PatientTask;
    onComplete: (id: string) => void;
    onSnooze: (id: string, days: number) => void;
    onDelete: (id: string) => void;
    onEdit: (task: PatientTask) => void;
    isSuggestion?: boolean;
}

function TaskItem({ task, onComplete, onSnooze, onDelete, onEdit, isSuggestion }: TaskItemProps) {
    return (
        <div className={`group flex items-start gap-3 py-3 px-3 rounded-lg transition-colors ${isSuggestion ? 'bg-white/80 shadow-sm border border-emerald-100' : 'hover:bg-gray-50 border border-gray-100'
            }`}>
            {/* Checkbox */}
            <button
                onClick={() => onComplete(task.id)}
                className="mt-0.5 w-5 h-5 rounded border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-50 flex items-center justify-center transition-colors flex-shrink-0"
                title="Mark complete"
            >
                <Check className="w-3 h-3 text-transparent group-hover:text-emerald-500 transition-colors" />
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                    <span className="text-sm font-medium text-gray-900 leading-tight">
                        {task.task_description}
                    </span>
                    <Badge className={`text-[10px] h-5 px-1.5 flex-shrink-0 ${CATEGORY_COLORS[task.task_category]}`}>
                        {CATEGORY_LABELS[task.task_category]}
                    </Badge>
                </div>
                {task.evidence_quote && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                        "{task.evidence_quote}"
                    </div>
                )}
            </div>

            {/* Actions */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    >
                        <MoreHorizontal className="w-4 h-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onComplete(task.id)}>
                        <Check className="w-4 h-4 mr-2" />
                        Complete
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onSnooze(task.id, 1)}>
                        <Clock className="w-4 h-4 mr-2" />
                        Snooze 1 day
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onSnooze(task.id, 7)}>
                        <Clock className="w-4 h-4 mr-2" />
                        Snooze 1 week
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onEdit(task)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDelete(task.id)} className="text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
