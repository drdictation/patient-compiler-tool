'use client';

import { Button } from "@/components/ui/button";
import { PlusCircle, FileText, Scan, UserCog } from "lucide-react";
import { useState } from "react";

interface MobileActionBarProps {
    onAddNote: () => void;
    onSmartNote: () => void;
    onPatientDetails: () => void;
    onGlobalScan: () => void;
}

export function MobileActionBar({
    onAddNote,
    onSmartNote,
    onPatientDetails,
    onGlobalScan
}: MobileActionBarProps) {
    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t shadow-lg px-4 py-3 safe-area-inset-bottom">
            <div className="flex items-center justify-around gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="flex-col h-auto py-2 px-3 gap-1"
                    onClick={onAddNote}
                >
                    <PlusCircle className="h-5 w-5" />
                    <span className="text-[10px]">Add Note</span>
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    className="flex-col h-auto py-2 px-3 gap-1"
                    onClick={onSmartNote}
                >
                    <FileText className="h-5 w-5" />
                    <span className="text-[10px]">Smart Note</span>
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    className="flex-col h-auto py-2 px-3 gap-1"
                    onClick={onGlobalScan}
                >
                    <Scan className="h-5 w-5" />
                    <span className="text-[10px]">Scan All</span>
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    className="flex-col h-auto py-2 px-3 gap-1"
                    onClick={onPatientDetails}
                >
                    <UserCog className="h-5 w-5" />
                    <span className="text-[10px]">Details</span>
                </Button>
            </div>
        </div>
    );
}
