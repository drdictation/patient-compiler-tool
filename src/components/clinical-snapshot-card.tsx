'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    ClinicalSnapshot,
    EMPTY_CLINICAL_SNAPSHOT,
    PriorNoteInput,
    parseClinicalSnapshotFromNotes,
} from '@/lib/clinical-snapshot';
import { savePatientClinicalSnapshot } from '@/app/actions';
import { toast } from 'sonner';
import {
    Sparkles,
    Save,
    Check,
    Loader2,
    ChevronDown,
    ChevronUp,
    Stethoscope,
    History,
    Microscope,
    Pill,
    Edit3,
} from 'lucide-react';

interface ClinicalSnapshotCardProps {
    patientId: string;
    initialSnapshot?: ClinicalSnapshot | null;
    priorNotes?: PriorNoteInput[];
    mode: 'cockpit' | 'page';
    onSnapshotChange?: (snapshot: ClinicalSnapshot) => void;
}

const QUADRANTS: Array<{
    key: keyof Omit<ClinicalSnapshot, 'updatedAt'>;
    label: string;
    placeholder: string;
    icon: typeof Stethoscope;
    accent: string;
}> = [
    {
        key: 'keySx',
        label: 'Key Sx & Active Issues',
        placeholder: 'Paste or type key symptoms, duration, trajectory...',
        icon: Stethoscope,
        accent: 'text-rose-600',
    },
    {
        key: 'phx',
        label: 'PHx / Surgical Hx',
        placeholder: 'Paste relevant past medical/surgical history...',
        icon: History,
        accent: 'text-indigo-600',
    },
    {
        key: 'ix',
        label: 'Key Ix & Scopes',
        placeholder: 'Colonoscopy, gastroscopy, calprotectin, CT, bloods...',
        icon: Microscope,
        accent: 'text-amber-600',
    },
    {
        key: 'medsAndPlan',
        label: 'Meds & Last Plan',
        placeholder: 'Current GI meds, failed trials, last consult plan...',
        icon: Pill,
        accent: 'text-emerald-600',
    },
];

function hasAnyContent(snap: ClinicalSnapshot): boolean {
    return Boolean(
        snap.keySx.trim() || snap.phx.trim() || snap.ix.trim() || snap.medsAndPlan.trim()
    );
}

function getLocalStorageKey(patientId: string): string {
    return `pct_clinical_snapshot_${patientId}`;
}

export function ClinicalSnapshotCard({
    patientId,
    initialSnapshot,
    priorNotes = [],
    mode,
    onSnapshotChange,
}: ClinicalSnapshotCardProps) {
    const [snapshot, setSnapshot] = useState<ClinicalSnapshot>(() => ({
        ...EMPTY_CLINICAL_SNAPSHOT,
        ...(initialSnapshot || {}),
    }));
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [justSaved, setJustSaved] = useState(false);
    const [usingLocalFallback, setUsingLocalFallback] = useState(false);

    // Page mode UI state
    const [isExpanded, setIsExpanded] = useState(() => hasAnyContent(initialSnapshot || EMPTY_CLINICAL_SNAPSHOT));
    const [isEditingPage, setIsEditingPage] = useState(false);

    // Load localStorage fallback on mount if DB snapshot is empty
    useEffect(() => {
        if (hasAnyContent(initialSnapshot || EMPTY_CLINICAL_SNAPSHOT)) {
            setSnapshot({ ...EMPTY_CLINICAL_SNAPSHOT, ...initialSnapshot });
            return;
        }
        try {
            const raw = localStorage.getItem(getLocalStorageKey(patientId));
            if (raw) {
                const parsed = JSON.parse(raw) as ClinicalSnapshot;
                if (hasAnyContent(parsed)) {
                    setSnapshot({ ...EMPTY_CLINICAL_SNAPSHOT, ...parsed });
                    setIsExpanded(true);
                    setUsingLocalFallback(true);
                }
            }
        } catch {
            // Ignore malformed local cache
        }
    }, [patientId, initialSnapshot]);

    const persistSnapshot = useCallback(async (nextSnap: ClinicalSnapshot, silent = false) => {
        setIsSaving(true);
        try {
            const res = await savePatientClinicalSnapshot(patientId, nextSnap);
            if (res.success) {
                try {
                    localStorage.removeItem(getLocalStorageKey(patientId));
                } catch {}
                setUsingLocalFallback(false);
                setIsDirty(false);
                setJustSaved(true);
                setTimeout(() => setJustSaved(false), 2000);
                onSnapshotChange?.(nextSnap);
                if (!silent) toast.success('Clinical snapshot saved');
            } else if (res.missingColumn) {
                try {
                    localStorage.setItem(getLocalStorageKey(patientId), JSON.stringify({
                        ...nextSnap,
                        updatedAt: new Date().toISOString(),
                    }));
                } catch {}
                setUsingLocalFallback(true);
                setIsDirty(false);
                setJustSaved(true);
                setTimeout(() => setJustSaved(false), 2000);
                onSnapshotChange?.(nextSnap);
                if (!silent) {
                    toast.info('Saved locally on this device (run supabase_migration_clinical_snapshot.sql to sync across devices)');
                }
            } else {
                toast.error(res.error || 'Failed to save snapshot');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Failed to save snapshot');
        } finally {
            setIsSaving(false);
        }
    }, [patientId, onSnapshotChange]);

    const handleFieldChange = (field: keyof Omit<ClinicalSnapshot, 'updatedAt'>, value: string) => {
        setSnapshot(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
        setJustSaved(false);
    };

    const handleAutoFill = () => {
        if (!priorNotes || priorNotes.length === 0) {
            toast.info('No prior consult notes available to auto-fill from');
            return;
        }
        const extracted = parseClinicalSnapshotFromNotes(priorNotes);
        if (!hasAnyContent(extracted)) {
            toast.info('Could not match structured sections in prior notes — you can paste directly');
            return;
        }
        const merged: ClinicalSnapshot = {
            keySx: snapshot.keySx.trim() ? snapshot.keySx : extracted.keySx,
            phx: snapshot.phx.trim() ? snapshot.phx : extracted.phx,
            ix: snapshot.ix.trim() ? snapshot.ix : extracted.ix,
            medsAndPlan: snapshot.medsAndPlan.trim() ? snapshot.medsAndPlan : extracted.medsAndPlan,
        };
        setSnapshot(merged);
        setIsDirty(true);
        if (mode === 'page') {
            setIsExpanded(true);
            setIsEditingPage(true);
        }
        toast.success('Auto-filled empty fields from prior notes');
    };

    if (mode === 'cockpit') {
        return (
            <div className="flex-1 min-h-0 flex flex-col p-3 gap-2.5 bg-slate-50/40">
                <div className="flex items-center justify-between gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-semibold text-slate-700 truncate">
                            Quick Reference (PHx / Sx / Ix / Plan)
                        </span>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-slate-500 bg-white">
                            Reference only
                        </Badge>
                        {usingLocalFallback && (
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-amber-700 border-amber-200 bg-amber-50">
                                Local cache
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAutoFill}
                            disabled={priorNotes.length === 0}
                            className="h-7 px-2 text-xs gap-1 bg-white"
                            title="Populate empty boxes from prior consult notes"
                        >
                            <Sparkles className="h-3 w-3 text-indigo-600" />
                            Auto-fill
                        </Button>
                        <Button
                            type="button"
                            variant={isDirty ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => persistSnapshot(snapshot)}
                            disabled={isSaving || (!isDirty && !justSaved)}
                            className="h-7 px-2.5 text-xs gap-1"
                        >
                            {isSaving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : justSaved ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                                <Save className="h-3 w-3" />
                            )}
                            {isSaving ? 'Saving' : justSaved ? 'Saved' : 'Save'}
                        </Button>
                    </div>
                </div>

                {/* 2x2 zero-scroll grid */}
                <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-2.5">
                    {QUADRANTS.map((q) => {
                        const Icon = q.icon;
                        return (
                            <div
                                key={q.key}
                                className="flex flex-col min-h-0 rounded-lg border border-slate-200 bg-white p-2 shadow-2xs"
                            >
                                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 mb-1 flex-shrink-0">
                                    <Icon className={`h-3.5 w-3.5 ${q.accent}`} />
                                    <span>{q.label}</span>
                                </label>
                                <Textarea
                                    value={snapshot[q.key]}
                                    onChange={(e) => handleFieldChange(q.key, e.target.value)}
                                    onBlur={() => {
                                        if (isDirty && !isSaving) {
                                            persistSnapshot(snapshot, true);
                                        }
                                    }}
                                    placeholder={q.placeholder}
                                    className="flex-1 min-h-0 resize-none border-0 p-1 text-xs leading-relaxed bg-slate-50/50 focus-visible:ring-1 focus-visible:bg-white rounded"
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // PAGE MODE (collapsible header card on PatientContentView)
    const populated = hasAnyContent(snapshot);

    return (
        <section className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            <div
                onClick={() => setIsExpanded(prev => !prev)}
                className="px-4 py-2.5 flex items-center justify-between gap-2 cursor-pointer bg-slate-50/70 hover:bg-slate-100/70 transition-colors"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <Stethoscope className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-800">
                        Clinical Snapshot
                    </span>
                    <span className="text-[11px] text-slate-500 truncate hidden sm:inline">
                        {populated ? 'PHx • Key Sx • Ix • Meds & Plan' : 'Click to paste PHx, Key Sx, Ix, or auto-fill'}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {isExpanded && !isEditingPage && (
                        <>
                            {priorNotes.length > 0 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleAutoFill}
                                    className="h-7 px-2 text-xs gap-1 text-indigo-700"
                                >
                                    <Sparkles className="h-3 w-3" />
                                    Auto-fill
                                </Button>
                            )}
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsEditingPage(true)}
                                className="h-7 px-2 text-xs gap-1"
                            >
                                <Edit3 className="h-3 w-3" />
                                Edit
                            </Button>
                        </>
                    )}
                    {isExpanded && isEditingPage && (
                        <>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsEditingPage(false)}
                                className="h-7 px-2 text-xs"
                            >
                                Done
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={async () => {
                                    await persistSnapshot(snapshot);
                                    setIsEditingPage(false);
                                }}
                                disabled={isSaving}
                                className="h-7 px-2.5 text-xs gap-1"
                            >
                                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                Save
                            </Button>
                        </>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsExpanded(prev => !prev)}
                        className="h-7 w-7"
                    >
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                    </Button>
                </div>
            </div>

            {isExpanded && (
                <div className="p-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {QUADRANTS.map((q) => {
                        const Icon = q.icon;
                        const val = snapshot[q.key];
                        return (
                            <div key={q.key} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                                    <Icon className={`h-3.5 w-3.5 ${q.accent}`} />
                                    <span>{q.label}</span>
                                </div>
                                {isEditingPage ? (
                                    <Textarea
                                        value={val}
                                        onChange={(e) => handleFieldChange(q.key, e.target.value)}
                                        placeholder={q.placeholder}
                                        rows={4}
                                        className="text-xs bg-white resize-y min-h-[76px]"
                                    />
                                ) : (
                                    <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                                        {val.trim() || <span className="text-slate-400 italic">Not recorded</span>}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
