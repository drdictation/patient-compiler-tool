'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Loader2, Check, X, Clock, Pencil, Trash2, MoreHorizontal,
    ListTodo, ChevronRight
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { toast } from 'sonner';
import { completeTask, snoozeTask, deleteTask, getPendingTasks, TaskWithPatient } from '@/app/actions';

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

interface TasksSidebarProps {
    initialTasks?: TaskWithPatient[];
}

export function TasksSidebar({ initialTasks = [] }: TasksSidebarProps) {
    const [tasks, setTasks] = useState<TaskWithPatient[]>(initialTasks);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isPending, startTransition] = useTransition();

    // Fetch tasks when sidebar opens
    useEffect(() => {
        if (isOpen && tasks.length === 0) {
            fetchTasks();
        }
    }, [isOpen]);

    async function fetchTasks() {
        setIsLoading(true);
        try {
            const fetchedTasks = await getPendingTasks();
            setTasks(fetchedTasks);
        } catch (e: any) {
            toast.error(`Failed to fetch tasks: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    }

    // Complete task
    async function handleComplete(taskId: string) {
        setTasks(prev => prev.filter(t => t.id !== taskId));

        startTransition(async () => {
            try {
                await completeTask(taskId);
                toast.success('Task completed');
            } catch (e: any) {
                fetchTasks(); // Refresh on error
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    // Snooze task
    async function handleSnooze(taskId: string, days: number) {
        setTasks(prev => prev.filter(t => t.id !== taskId));

        startTransition(async () => {
            try {
                await snoozeTask(taskId, days);
                toast.success(`Task snoozed for ${days} day${days > 1 ? 's' : ''}`);
            } catch (e: any) {
                fetchTasks();
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
                fetchTasks();
                toast.error(`Failed: ${e.message}`);
            }
        });
    }

    // Group tasks by patient
    const tasksByPatient = tasks.reduce((acc, task) => {
        const patientId = task.patient_id;
        if (!acc[patientId]) {
            acc[patientId] = {
                patientName: task.patient_name,
                tasks: []
            };
        }
        acc[patientId].tasks.push(task);
        return acc;
    }, {} as Record<string, { patientName: string; tasks: TaskWithPatient[] }>);

    const totalTasks = tasks.length;

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 relative">
                    <ListTodo className="h-4 w-4" />
                    <span className="hidden sm:inline">Tasks</span>
                    {totalTasks > 0 && (
                        <Badge
                            variant="destructive"
                            className="h-5 min-w-5 px-1.5 text-xs absolute -top-2 -right-2"
                        >
                            {totalTasks}
                        </Badge>
                    )}
                </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <ListTodo className="h-5 w-5 text-emerald-600" />
                        Pending Tasks
                        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    </SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <ListTodo className="w-12 h-12 mx-auto mb-4 opacity-30" />
                            <p>No pending tasks</p>
                            <p className="text-sm mt-1">Tasks will appear here when you generate Smart Notes</p>
                        </div>
                    ) : (
                        Object.entries(tasksByPatient).map(([patientId, { patientName, tasks: patientTasks }]) => (
                            <div key={patientId} className="space-y-2">
                                {/* Patient Header */}
                                <Link
                                    href={`/patient/${patientId}`}
                                    className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors group"
                                >
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                    {patientName}
                                    <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </Link>

                                {/* Patient Tasks */}
                                <div className="pl-4 space-y-2">
                                    {patientTasks.map(task => (
                                        <TaskRow
                                            key={task.id}
                                            task={task}
                                            onComplete={handleComplete}
                                            onSnooze={handleSnooze}
                                            onDelete={handleDelete}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

interface TaskRowProps {
    task: TaskWithPatient;
    onComplete: (id: string) => void;
    onSnooze: (id: string, days: number) => void;
    onDelete: (id: string) => void;
}

function TaskRow({ task, onComplete, onSnooze, onDelete }: TaskRowProps) {
    const createdDate = new Date(task.created_at).toLocaleDateString('en-AU', {
        month: 'short',
        day: 'numeric'
    });

    return (
        <div className="group flex items-start gap-2 py-2 px-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors">
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
                    <span className="text-sm text-gray-900 leading-tight flex-1">
                        {task.task_description}
                    </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <Badge className={`text-[9px] h-4 px-1 ${CATEGORY_COLORS[task.task_category]}`}>
                        {CATEGORY_LABELS[task.task_category]}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                        {createdDate}
                    </span>
                </div>
            </div>

            {/* Actions */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
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
                    <DropdownMenuItem onClick={() => onDelete(task.id)} className="text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
