'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MoreVertical, Inbox, Search, Plus, Calendar, CheckSquare, RefreshCw } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EndoscopyListDialog } from '@/components/endoscopy-list-dialog';
import { AddPatientDialog } from '@/components/add-patient-dialog';
import { TasksSidebar } from '@/components/tasks-sidebar';
import { SyncButton } from '@/components/sync-button';
import { GlobalSearch } from '@/components/global-search';

interface MobileHeaderActionsProps {
    patients: any[];
}

export function MobileHeaderActions({ patients }: MobileHeaderActionsProps) {
    const [addPatientOpen, setAddPatientOpen] = useState(false);
    const [endoscopyOpen, setEndoscopyOpen] = useState(false);

    return (
        <div className="flex items-center gap-1.5 md:hidden">
            {/* Direct quick-access actions */}
            <Link href="/inbox">
                <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-700" title="Inbox">
                    <Inbox className="h-4 w-4" />
                </Button>
            </Link>

            {/* Overflow Dropdown for Secondary Clinical Tools */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9 border-slate-200" title="More Options">
                        <MoreVertical className="h-4 w-4 text-slate-700" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lg rounded-xl">
                    <div className="p-1">
                        <AddPatientDialog />
                    </div>
                    <div className="p-1">
                        <EndoscopyListDialog patients={patients} />
                    </div>
                    <div className="p-1">
                        <TasksSidebar />
                    </div>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem asChild>
                        <Link href="/search" className="flex items-center gap-2 px-2.5 py-2 text-xs font-medium cursor-pointer rounded-lg">
                            <Search className="h-4 w-4 text-slate-500" />
                            <span>Full-Text Search</span>
                        </Link>
                    </DropdownMenuItem>
                    <div className="p-1">
                        <SyncButton />
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
