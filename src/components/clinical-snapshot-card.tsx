'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    PriorNoteInput,
    SlicedClinicalHistory,
    SlicedSectionEntry,
    slicePriorNotesBySubtitle,
} from '@/lib/clinical-snapshot';
import ReactMarkdown from 'react-markdown';
import {
    ChevronDown,
    ChevronUp,
    Stethoscope,
    History,
    Microscope,
    ClipboardList,
} from 'lucide-react';

interface ClinicalSnapshotCardProps {
    priorNotes?: PriorNoteInput[];
    mode: 'cockpit' | 'page';
}

const QUADRANTS: Array<{
    key: keyof SlicedClinicalHistory;
    label: string;
    emptyText: string;
    icon: typeof Stethoscope;
    accent: string;
    headerBg: string;
}> = [
    {
        key: 'issues',
        label: 'Issues & Interval Hx',
        emptyText: 'No Issues or Interval History sections found.',
        icon: Stethoscope,
        accent: 'text-rose-600',
        headerBg: 'bg-rose-50/60',
    },
    {
        key: 'phxMeds',
        label: 'PHx & Meds',
        emptyText: 'No Past Medical History or Medications sections found.',
        icon: History,
        accent: 'text-indigo-600',
        headerBg: 'bg-indigo-50/60',
    },
    {
        key: 'ixTrials',
        label: 'Ix & Prior Trials',
        emptyText: 'No Investigation Results or Trials sections found.',
        icon: Microscope,
        accent: 'text-amber-600',
        headerBg: 'bg-amber-50/60',
    },
    {
        key: 'plans',
        label: 'Plans',
        emptyText: 'No Plan sections found.',
        icon: ClipboardList,
        accent: 'text-emerald-600',
        headerBg: 'bg-emerald-50/60',
    },
];

function SlicedEntryList({
    entries,
    emptyText,
}: {
    entries: SlicedSectionEntry[];
    emptyText: string;
}) {
    if (entries.length === 0) {
        return (
            <p className="text-[11px] text-slate-400 italic py-2 px-1">
                {emptyText}
            </p>
        );
    }

    return (
        <div className="space-y-2">
            {entries.map((entry, idx) => (
                <div
                    key={entry.id}
                    className={`rounded-md border p-2 ${
                        idx === 0
                            ? 'border-indigo-200/80 bg-indigo-50/25'
                            : 'border-slate-100 bg-slate-50/50'
                    }`}
                >
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                idx === 0
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-slate-200/70 text-slate-600'
                            }`}
                        >
                            {entry.formattedDate}
                            {idx === 0 && entries.length > 1 ? ' (Latest)' : ''}
                        </span>
                        <span className="text-[9px] uppercase tracking-wide text-slate-400">
                            {entry.sourceLabel}
                        </span>
                    </div>
                    <div className="prose prose-xs max-w-none text-slate-700 leading-snug [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&_li]:my-0.5">
                        <ReactMarkdown>{entry.content}</ReactMarkdown>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function ClinicalSnapshotCard({
    priorNotes = [],
    mode,
}: ClinicalSnapshotCardProps) {
    const sliced = useMemo(() => slicePriorNotesBySubtitle(priorNotes), [priorNotes]);

    const totalMatches =
        sliced.issues.length +
        sliced.phxMeds.length +
        sliced.ixTrials.length +
        sliced.plans.length;

    const [isExpanded, setIsExpanded] = useState(() => totalMatches > 0);

    if (mode === 'cockpit') {
        return (
            <div className="flex-1 min-h-0 flex flex-col p-3 gap-2.5 bg-slate-50/40">
                <div className="flex items-center justify-between gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-semibold text-slate-700 truncate">
                            Auto-Sliced Consult History
                        </span>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-slate-500 bg-white">
                            Newest first • Regex only
                        </Badge>
                    </div>
                    <span className="text-[11px] text-slate-500 flex-shrink-0">
                        {priorNotes.length} {priorNotes.length === 1 ? 'consult' : 'consults'}
                    </span>
                </div>

                {/* 2x2 zero-scroll grid — each box scrolls independently if history is long */}
                <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-2.5">
                    {QUADRANTS.map((q) => {
                        const Icon = q.icon;
                        const entries = sliced[q.key];
                        return (
                            <div
                                key={q.key}
                                className="flex flex-col min-h-0 rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs"
                            >
                                <div className={`px-2.5 py-1.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0 ${q.headerBg}`}>
                                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-800">
                                        <Icon className={`h-3.5 w-3.5 ${q.accent}`} />
                                        <span>{q.label}</span>
                                    </span>
                                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-white/80 text-slate-600">
                                        {entries.length}
                                    </Badge>
                                </div>
                                <div className="flex-1 min-h-0 overflow-y-auto p-2">
                                    <SlicedEntryList entries={entries} emptyText={q.emptyText} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // PAGE MODE (collapsible 4-column summary at top of PatientContentView)
    return (
        <section className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            <div
                onClick={() => setIsExpanded(prev => !prev)}
                className="px-4 py-2.5 flex items-center justify-between gap-2 cursor-pointer bg-slate-50/70 hover:bg-slate-100/70 transition-colors"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <Stethoscope className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-800">
                        Consult Snapshot
                    </span>
                    <span className="text-[11px] text-slate-500 truncate hidden sm:inline">
                        Auto-sliced newest first: Issues • PHx &amp; Meds • Ix &amp; Trials • Plans
                    </span>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(prev => !prev);
                    }}
                    className="h-7 w-7"
                >
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                </Button>
            </div>

            {isExpanded && (
                <div className="p-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {QUADRANTS.map((q) => {
                        const Icon = q.icon;
                        const entries = sliced[q.key];
                        return (
                            <div key={q.key} className="rounded-lg border border-slate-200 bg-white flex flex-col overflow-hidden">
                                <div className={`px-2.5 py-1.5 border-b border-slate-100 flex items-center justify-between ${q.headerBg}`}>
                                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-800">
                                        <Icon className={`h-3.5 w-3.5 ${q.accent}`} />
                                        <span>{q.label}</span>
                                    </span>
                                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-white/80 text-slate-600">
                                        {entries.length}
                                    </Badge>
                                </div>
                                <div className="p-2 max-h-56 overflow-y-auto">
                                    <SlicedEntryList entries={entries} emptyText={q.emptyText} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
