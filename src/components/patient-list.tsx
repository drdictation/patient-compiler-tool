
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PatientRowActions } from '@/components/patient-row-actions';
import { Trash2, Merge, X, Search, Filter, FileText, MessageSquare, Loader2, Check, Mic, ClipboardList, Calendar, Zap, Plus, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useDebounce } from 'use-debounce';
import ReactMarkdown from 'react-markdown';
import { getLatestPatientArtifact, getBatchPatientArtifacts, PatientArtifactCacheItem } from '@/app/actions';
import { MobileConsultSheet } from '@/components/mobile-consult-sheet';
import { TodayListDialog } from '@/components/today-list-dialog';

interface Patient {
    id: string;
    display_name: string;
    normalized_name: string;
    identity_verified: boolean;
    last_seen: string | null;
    encounter_count: number;
    record_count: number;
    // New fields
    referring_doctor?: string | null;
    next_recall_date?: string | null;
    suggested_items_count?: number;
    pending_task_count?: number;
}

interface QuickCopyButtonProps {
    patientId: string;
    type: 'INTERNAL_NOTE' | 'REFERRER_LETTER' | 'PATIENT_SUMMARY';
    label: string;
    cachedContent?: string | null;
}

function QuickCopyButton({ patientId, type, label, cachedContent }: QuickCopyButtonProps) {
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [markdownContent, setMarkdownContent] = useState<string | null>(null);
    const hiddenRef = useRef<HTMLDivElement>(null);

    // If cachedContent is explicitly null, we know no artifact exists for this patient
    const isAvailable = cachedContent === undefined || cachedContent !== null;

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row navigation
        e.preventDefault();  // Prevent default Link action
        if (loading || copied || !isAvailable) return;

        let content: string | null | undefined = cachedContent;

        if (content === undefined) {
            setLoading(true);
            try {
                content = await getLatestPatientArtifact(patientId, type);
            } catch (err) {
                console.error('Failed to copy latest artifact:', err);
                toast.error(`Failed to copy recent ${label.toLowerCase()}`);
                setLoading(false);
                return;
            }
        }

        if (!content) {
            toast.error(`No recent ${label.toLowerCase()} found for this patient`);
            setLoading(false);
            return;
        }

        setLoading(true);
        // Set the markdown content to render it in the hidden container
        setMarkdownContent(content);

        // Wait a tick for React to render the hidden container
        setTimeout(async () => {
            if (hiddenRef.current) {
                try {
                    const element = hiddenRef.current;
                    const clone = element.cloneNode(true) as HTMLElement;
                    const baseStyle = 'font-family: Arial, sans-serif; font-size: 10pt;';
                    clone.style.cssText = baseStyle;

                    // Style all paragraphs
                    clone.querySelectorAll('p').forEach((p) => {
                        (p as HTMLElement).style.cssText = `${baseStyle} margin: 6pt 0;`;
                    });

                    // Style all list items and lists with proper indentation
                    clone.querySelectorAll('ul, ol').forEach((list) => {
                        (list as HTMLElement).style.cssText = `${baseStyle} margin-left: 24pt; padding-left: 0; margin-top: 6pt; margin-bottom: 6pt;`;
                    });

                    clone.querySelectorAll('li').forEach((li) => {
                        (li as HTMLElement).style.cssText = `${baseStyle} margin: 3pt 0;`;
                    });

                    // Style headings
                    clone.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
                        (h as HTMLElement).style.cssText = `${baseStyle} font-weight: bold; margin-top: 12pt; margin-bottom: 6pt;`;
                    });

                    // Style strong/bold
                    clone.querySelectorAll('strong, b').forEach((s) => {
                        (s as HTMLElement).style.cssText = `${baseStyle} font-weight: bold;`;
                    });

                    const html = clone.innerHTML;
                    const text = element.innerText;

                    const blob = new Blob([`<div style="${baseStyle}">${html}</div>`], { type: 'text/html' });
                    const textBlob = new Blob([text], { type: 'text/plain' });

                    await navigator.clipboard.write([
                        new ClipboardItem({
                            'text/html': blob,
                            'text/plain': textBlob,
                        })
                    ]);
                    toast.success(`Recent ${label.toLowerCase()} copied with formatting`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                } catch (err) {
                    console.error('[QuickCopy] Rich copy failed, falling back:', err);
                    // Fallback to plain text
                    await navigator.clipboard.writeText(content as string);
                    toast.success(`Recent ${label.toLowerCase()} copied as plain text`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                } finally {
                    setMarkdownContent(null);
                }
            }
            setLoading(false);
        }, 50);
    };

    const Icon = type === 'INTERNAL_NOTE' 
        ? FileText 
        : type === 'REFERRER_LETTER' 
            ? MessageSquare 
            : Sparkles;

    return (
        <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
            <Button
                variant="outline"
                size="sm"
                className={`h-7 px-2.5 gap-1.5 transition-all text-xs font-medium border-slate-200 shadow-sm ${
                    copied 
                        ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-700' 
                        : !isAvailable
                            ? 'opacity-40 bg-slate-50 text-slate-400 cursor-not-allowed hover:bg-slate-50 hover:text-slate-400'
                            : 'bg-white hover:bg-slate-50 hover:text-indigo-600'
                }`}
                onClick={handleCopy}
                disabled={loading || !isAvailable}
                title={
                    !isAvailable 
                        ? `No recent ${label.toLowerCase()} found` 
                        : `Copy Most Recent ${label}${cachedContent ? ' (Instant • 0ms)' : ''}`
                }
            >
                {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : copied ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                    <>
                        <Icon className={`h-3.5 w-3.5 ${!isAvailable ? 'text-slate-300' : 'text-slate-400 group-hover:text-indigo-600'}`} />
                        <span>Copy {label}</span>
                        {cachedContent && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" title="Pre-cached in memory" />
                        )}
                    </>
                )}
            </Button>

            {/* Hidden container for copying with rich formatting */}
            {markdownContent && (
                <div 
                    ref={hiddenRef}
                    style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0, pointerEvents: 'none' }}
                >
                    <ReactMarkdown>{markdownContent}</ReactMarkdown>
                </div>
            )}
        </div>
    );
}

export function PatientList({ initialPatients }: { initialPatients: Patient[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // URL State
    const [search, setSearch] = useState(searchParams.get('search') || '');
    const [debouncedSearch] = useDebounce(search, 500);
    const [sort, setSort] = useState(searchParams.get('sort') || 'last_seen');
    const [filterRecall, setFilterRecall] = useState(searchParams.get('filter_recall') === 'true');
    const [filterSuggested, setFilterSuggested] = useState(searchParams.get('filter_suggested') === 'true');

    // Managing Filters
    const [activeRecordPatient, setActiveRecordPatient] = useState<{ id: string; name: string } | null>(null);

    // Today's List State (Option B: Browser localStorage)
    const [todayPatientIds, setTodayPatientIds] = useState<string[]>([]);
    const [viewMode, setViewMode] = useState<'today' | 'all'>('all');
    const [isTodayDialogOpen, setIsTodayDialogOpen] = useState(false);
    const [artifactCache, setArtifactCache] = useState<Record<string, PatientArtifactCacheItem>>({});
    const [isPreFetching, setIsPreFetching] = useState(false);

    // Load Today's patient IDs and cached artifacts from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem('pct_today_patient_ids');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setTodayPatientIds(parsed);
                    setViewMode('today');
                }
            }
            const storedCache = localStorage.getItem('pct_today_artifact_cache');
            if (storedCache) {
                const parsedCache = JSON.parse(storedCache);
                if (parsedCache && typeof parsedCache === 'object') {
                    setArtifactCache(parsedCache);
                }
            }
        } catch (e) {
            console.error('Failed to load today patient data from localStorage', e);
        }
    }, []);

    // Batch pre-fetch notes, letters, and summaries for all patients on today's list
    useEffect(() => {
        if (todayPatientIds.length === 0) return;
        setIsPreFetching(true);
        getBatchPatientArtifacts(todayPatientIds)
            .then(data => {
                setArtifactCache(prev => {
                    const merged = { ...prev, ...data };
                    try {
                        localStorage.setItem('pct_today_artifact_cache', JSON.stringify(merged));
                    } catch (e) {
                        console.error('Failed to save artifact cache to localStorage', e);
                    }
                    return merged;
                });
            })
            .catch(err => {
                console.error('Error pre-fetching today patient artifacts:', err);
            })
            .finally(() => {
                setIsPreFetching(false);
            });
    }, [todayPatientIds]);

    const handleSaveTodayList = (ids: string[]) => {
        setTodayPatientIds(ids);
        try {
            localStorage.setItem('pct_today_patient_ids', JSON.stringify(ids));
            if (ids.length === 0) {
                localStorage.removeItem('pct_today_artifact_cache');
                setArtifactCache({});
            }
        } catch (e) {
            console.error('Failed to save today patient ids to localStorage', e);
        }
        if (ids.length > 0) {
            setViewMode('today');
        }
    };

    const handleRemoveFromTodayList = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const updated = todayPatientIds.filter(item => item !== id);
        setTodayPatientIds(updated);
        try {
            localStorage.setItem('pct_today_patient_ids', JSON.stringify(updated));
        } catch (e) {
            console.error(e);
        }
        toast.info("Removed from today's list");
    };

    const handleAddToTodayList = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (todayPatientIds.includes(id)) {
            toast.info("Patient is already on today's list");
            return;
        }
        const updated = [...todayPatientIds, id];
        setTodayPatientIds(updated);
        try {
            localStorage.setItem('pct_today_patient_ids', JSON.stringify(updated));
        } catch (e) {
            console.error(e);
        }
        toast.success("Added to today's list");
    };

    const handleGenerated = (patientId: string, artifacts: { note?: string; letter?: string; summary?: string }) => {
        setArtifactCache(prev => {
            const next = {
                ...prev,
                [patientId]: {
                    ...prev[patientId],
                    internalNote: artifacts.note ?? prev[patientId]?.internalNote,
                    referrerLetter: artifacts.letter ?? prev[patientId]?.referrerLetter,
                    patientSummary: artifacts.summary ?? prev[patientId]?.patientSummary,
                }
            };
            try {
                localStorage.setItem('pct_today_artifact_cache', JSON.stringify(next));
            } catch (e) {
                console.error(e);
            }
            return next;
        });
        router.refresh();
    };

    // Filter and order patients for display
    const todayPatients = initialPatients.filter(p => todayPatientIds.includes(p.id));
    const sortedTodayPatients = [...todayPatients].sort((a, b) => {
        return todayPatientIds.indexOf(a.id) - todayPatientIds.indexOf(b.id);
    });

    const displayedPatients = viewMode === 'today'
        ? sortedTodayPatients.filter(p => {
            if (!search) return true;
            const q = search.toLowerCase();
            return (
                p.display_name.toLowerCase().includes(q) ||
                p.normalized_name.toLowerCase().includes(q) ||
                (p.referring_doctor && p.referring_doctor.toLowerCase().includes(q))
            );
        })
        : initialPatients;

    const createQueryString = useCallback((name: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(name, value);
        else params.delete(name);
        return params.toString();
    }, [searchParams]);

    // Sync Search to URL
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (debouncedSearch) params.set('search', debouncedSearch);
        else params.delete('search');
        router.replace(`/?${params.toString()}`, { scroll: false });
    }, [debouncedSearch, router, searchParams]); // searchParams in dep array might loop? No, default behavior is fine.

    // Sync Flags to URL
    const updateFilter = (key: string, val: boolean) => {
        const params = new URLSearchParams(searchParams.toString());
        if (val) params.set(key, 'true');
        else params.delete(key);
        router.replace(`/?${params.toString()}`, { scroll: false });
    };

    const updateSort = (val: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('sort', val);
        router.replace(`/?${params.toString()}`, { scroll: false });
    };

    // --- Bulk Selection Logic ---
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleAll = () => {
        if (selectedIds.length === displayedPatients.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(displayedPatients.map(p => p.id));
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} patients and ALL their associated data?`)) return;

        setLoading(true);
        try {
            const res = await fetch('/api/patient/bulk-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedIds }),
            });

            if (!res.ok) throw new Error('Bulk delete failed');

            toast.success(`${selectedIds.length} patients deleted`);
            setSelectedIds([]);
            router.refresh();
        } catch (err) {
            toast.error('Error in bulk delete');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleMerge = async () => {
        if (selectedIds.length < 2) {
            toast.error('Select at least 2 patients to merge');
            return;
        }

        const targetId = selectedIds[0];
        const sourceIds = selectedIds.slice(1);
        const targetName = initialPatients.find(p => p.id === targetId)?.display_name;

        if (!confirm(`Merge ${sourceIds.length} patients into "${targetName}"? This consolidates all records and notes. Sources will be deleted.`)) return;

        setLoading(true);
        try {
            const res = await fetch('/api/patient/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId, sourceIds }),
            });

            if (!res.ok) throw new Error('Merge failed');

            toast.success('Patients merged successfully');
            setSelectedIds([]);
            router.refresh();
        } catch (err) {
            toast.error('Error merging patients');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* --- VIEW MODE TABS & TODAY'S LIST SETUP --- */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit border border-slate-200">
                    <button
                        type="button"
                        onClick={() => setViewMode('today')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            viewMode === 'today'
                                ? 'bg-white text-indigo-700 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                        <span>Today's List</span>
                        {todayPatientIds.length > 0 && (
                            <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                                {todayPatientIds.length}
                            </span>
                        )}
                        {isPreFetching && (
                            <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => setViewMode('all')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            viewMode === 'all'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <span>All Patients</span>
                        <span className="text-slate-400 font-normal text-[11px]">({initialPatients.length})</span>
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsTodayDialogOpen(true)}
                        className="h-8 px-3 gap-1.5 text-xs font-semibold border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 hover:text-indigo-800 transition-all shadow-2xs"
                    >
                        <ClipboardList className="h-3.5 w-3.5 text-indigo-600" />
                        <span>Set Up Today's List</span>
                    </Button>
                </div>
            </div>

            {/* --- TODAY'S LIST SCHEDULE STATUS BANNER --- */}
            {viewMode === 'today' && sortedTodayPatients.length > 0 && (
                <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-2.5 w-2.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </div>
                        <span className="font-semibold text-indigo-950">
                            Today's Schedule ({sortedTodayPatients.length} patient{sortedTodayPatients.length !== 1 ? 's' : ''})
                        </span>
                        <span className="text-indigo-300 hidden sm:inline">•</span>
                        <span className="text-slate-600 hidden sm:inline">
                            {isPreFetching ? (
                                <span className="inline-flex items-center gap-1.5 text-indigo-700 font-medium">
                                    <Loader2 className="h-3 w-3 animate-spin text-indigo-600" /> Pre-fetching past notes &amp; letters for instant copying...
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                    <Zap className="h-3 w-3 text-emerald-600 fill-emerald-600" /> Instant 0ms copy ready (pre-cached in local memory)
                                </span>
                            )}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsTodayDialogOpen(true)}
                            className="h-7 text-xs text-indigo-700 hover:bg-indigo-100/70 px-2.5 font-medium rounded-lg"
                        >
                            Edit Schedule
                        </Button>
                    </div>
                </div>
            )}

            {/* --- EMPTY STATE FOR TODAY'S LIST --- */}
            {viewMode === 'today' && todayPatientIds.length === 0 ? (
                <div className="py-16 px-6 text-center border-2 border-dashed border-indigo-200/80 rounded-2xl bg-indigo-50/30 space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                        <ClipboardList className="h-6 w-6" />
                    </div>
                    <div className="max-w-md mx-auto space-y-1.5">
                        <h3 className="font-bold text-slate-900 text-base">No patients on Today's List yet</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Paste your daily endoscopy list or consulting schedule names, or select patients from the directory. Their past consult notes and letters will be pre-fetched into memory for instant 0ms copy-pasting to your EMR.
                        </p>
                    </div>
                    <Button
                        onClick={() => setIsTodayDialogOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-9 px-4 gap-2 shadow-sm rounded-xl"
                    >
                        <Sparkles className="h-4 w-4" />
                        Set Up Today's List
                    </Button>
                </div>
            ) : (
                <>
                    {/* --- SEARCH & FILTERS BAR --- */}
                    <div className="bg-white p-3 md:p-4 rounded-lg border shadow-sm space-y-3 md:space-y-0 md:flex md:flex-row md:gap-4 md:items-center md:justify-between">
                        {/* Search Input */}
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={viewMode === 'today' ? "Filter today's list..." : "Search name, referrer..."}
                                className="pl-9"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        {/* Filters & Sort - Horizontally scrollable on mobile */}
                        <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                            {/* Recall Filter */}
                            <div className="flex items-center space-x-2 flex-shrink-0">
                                <Switch
                                    id="filter-recall"
                                    checked={filterRecall}
                                    onCheckedChange={(c: boolean) => { setFilterRecall(c); updateFilter('filter_recall', c); }}
                                />
                                <Label htmlFor="filter-recall" className="text-xs md:text-sm cursor-pointer whitespace-nowrap">
                                    Recall
                                </Label>
                            </div>

                            <div className="w-px h-6 bg-slate-200 flex-shrink-0" />

                            {/* Pending Actions Filter */}
                            <div className="flex items-center space-x-2 flex-shrink-0">
                                <Switch
                                    id="filter-suggested"
                                    checked={filterSuggested}
                                    onCheckedChange={(c: boolean) => { setFilterSuggested(c); updateFilter('filter_suggested', c); }}
                                />
                                <Label htmlFor="filter-suggested" className="text-xs md:text-sm cursor-pointer whitespace-nowrap">
                                    Pending Items
                                </Label>
                            </div>

                            <div className="w-px h-6 bg-slate-200 flex-shrink-0" />

                            {/* Sort Dropdown */}
                            <Select value={sort} onValueChange={(v) => { setSort(v); updateSort(v); }}>
                                <SelectTrigger className="w-[120px] md:w-[160px] flex-shrink-0">
                                    <SelectValue placeholder="Sort" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="last_seen">Recent</SelectItem>
                                    <SelectItem value="name">Name (A-Z)</SelectItem>
                                    <SelectItem value="recall">Recall Date</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="relative">
                        {/* Floating Bulk Actions Toolbar */}
                        {selectedIds.length > 0 && (
                            <div
                                className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[999] bg-[#020617] text-white px-8 py-5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-8 border border-white/20 scale-105"
                                style={{ backgroundColor: '#020617', color: 'white' }}
                            >
                                <div className="flex items-center gap-4 border-r border-slate-700 pr-8">
                                    <span className="bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-lg">
                                        {selectedIds.length}
                                    </span>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold tracking-tight text-white leading-tight">Patients Selected</span>
                                        <button
                                            onClick={() => setSelectedIds([])}
                                            className="text-slate-400 hover:text-white transition-colors text-[10px] text-left hover:underline"
                                        >
                                            Deselect All
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <Button
                                        size="default"
                                        variant="ghost"
                                        className="text-white hover:bg-red-500 hover:text-white gap-2 h-11 px-5 transition-all font-semibold"
                                        onClick={handleBulkDelete}
                                        disabled={loading}
                                    >
                                        <Trash2 className="h-5 w-5" />
                                        Delete
                                    </Button>
                                    <div className="w-[1px] h-8 bg-slate-700 mx-1" />
                                    <Button
                                        size="default"
                                        variant="ghost"
                                        className="text-white hover:bg-blue-600 hover:text-white gap-2 h-11 px-5 transition-all font-semibold"
                                        onClick={handleMerge}
                                        disabled={loading}
                                    >
                                        <Merge className="h-5 w-5" />
                                        Merge
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* --- DESKTOP TABLE (hidden on mobile) --- */}
                        <div className="border rounded-lg overflow-hidden bg-white shadow-sm hidden md:block">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-medium border-b">
                                    <tr>
                                        <th className="py-3 px-4 w-10">
                                            <Checkbox
                                                checked={selectedIds.length === displayedPatients.length && displayedPatients.length > 0}
                                                onCheckedChange={toggleAll}
                                            />
                                        </th>
                                        <th className="py-3 px-4">Patient Name</th>
                                        <th className="py-3 px-4">Identity</th>
                                        <th className="py-3 px-4">Last Seen</th>
                                        <th className="py-3 px-4">Next Recall</th>
                                        <th className="py-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {displayedPatients.map((patient) => {
                                        const isTodayPatient = todayPatientIds.includes(patient.id);
                                        const cached = artifactCache[patient.id];

                                        return (
                                            <tr
                                                key={patient.id}
                                                className={`group hover:bg-slate-50 transition-colors ${selectedIds.includes(patient.id) ? 'bg-slate-50/50' : ''}`}
                                            >
                                                <td className="py-3 px-4">
                                                    <Checkbox
                                                        checked={selectedIds.includes(patient.id)}
                                                        onCheckedChange={() => toggleSelect(patient.id)}
                                                    />
                                                </td>
                                                <td className="py-3 px-4 font-medium text-slate-900 group-hover:text-primary">
                                                    <div className="flex items-center justify-between gap-4 w-full">
                                                        <Link href={`/patient/${patient.id}`} className="hover:underline flex flex-col justify-center min-w-0">
                                                            <span className="font-semibold">{patient.display_name}</span>
                                                            {patient.referring_doctor && (
                                                                <span className="text-[10px] text-muted-foreground font-normal">
                                                                    Ref: {patient.referring_doctor}
                                                                </span>
                                                            )}
                                                        </Link>
                                                        
                                                        {/* In Today's view, copy buttons are permanently visible. In All view, visible on hover. */}
                                                        {viewMode === 'today' ? (
                                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                <QuickCopyButton
                                                                    patientId={patient.id}
                                                                    type="INTERNAL_NOTE"
                                                                    label="Note"
                                                                    cachedContent={cached?.internalNote}
                                                                />
                                                                <QuickCopyButton
                                                                    patientId={patient.id}
                                                                    type="REFERRER_LETTER"
                                                                    label="Letter"
                                                                    cachedContent={cached?.referrerLetter}
                                                                />
                                                                {cached?.patientSummary && (
                                                                    <QuickCopyButton
                                                                        patientId={patient.id}
                                                                        type="PATIENT_SUMMARY"
                                                                        label="Summary"
                                                                        cachedContent={cached?.patientSummary}
                                                                    />
                                                                )}
                                                            </div>
                                                        ) : patient.encounter_count > 0 && (
                                                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                                                <QuickCopyButton
                                                                    patientId={patient.id}
                                                                    type="INTERNAL_NOTE"
                                                                    label="Note"
                                                                    cachedContent={cached?.internalNote}
                                                                />
                                                                <QuickCopyButton
                                                                    patientId={patient.id}
                                                                    type="REFERRER_LETTER"
                                                                    label="Letter"
                                                                    cachedContent={cached?.referrerLetter}
                                                                />
                                                                {cached?.patientSummary && (
                                                                    <QuickCopyButton
                                                                        patientId={patient.id}
                                                                        type="PATIENT_SUMMARY"
                                                                        label="Summary"
                                                                        cachedContent={cached?.patientSummary}
                                                                    />
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-xs text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded">
                                                            {patient.normalized_name}
                                                        </span>
                                                        {patient.identity_verified && (
                                                            <span className="text-green-600 text-[10px] border border-green-200 bg-green-50 px-1.5 py-0 rounded-full font-medium">
                                                                Verified
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-slate-500">
                                                    {patient.last_seen ? new Date(patient.last_seen).toLocaleDateString() : 'Never'}
                                                </td>
                                                <td className="py-3 px-4 text-slate-500">
                                                    {patient.next_recall_date ? (
                                                        <span className={new Date(patient.next_recall_date) < new Date() ? "text-red-500 font-medium" : ""}>
                                                            {new Date(patient.next_recall_date).toLocaleDateString()}
                                                        </span>
                                                    ) : '-'}
                                                    {(patient.pending_task_count || 0) > 0 && (
                                                        <Badge variant="default" className="ml-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] h-5 px-1.5">
                                                            {patient.pending_task_count} Tasks
                                                        </Badge>
                                                    )}
                                                    {(patient.suggested_items_count || 0) > 0 && (
                                                        <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-200 text-[10px] h-5 px-1.5 border-amber-200">
                                                            {patient.suggested_items_count} Suggestions
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <div className="flex justify-end items-center gap-2">
                                                        {viewMode === 'today' ? (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        setActiveRecordPatient({ id: patient.id, name: patient.display_name });
                                                                    }}
                                                                    className="h-7 px-2.5 gap-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-2xs transition-all active:scale-95"
                                                                    title="Record Consult"
                                                                >
                                                                    <Mic className="h-3.5 w-3.5" />
                                                                    <span>Record</span>
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={(e) => handleRemoveFromTodayList(patient.id, e)}
                                                                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title="Remove from Today's List"
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                {!isTodayPatient ? (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={(e) => handleAddToTodayList(patient.id, e)}
                                                                        className="h-7 px-2 text-[11px] font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 gap-1 rounded-md"
                                                                        title="Add to Today's List"
                                                                    >
                                                                        <Plus className="h-3 w-3" />
                                                                        <span>Today</span>
                                                                    </Button>
                                                                ) : (
                                                                    <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                                                                        Today
                                                                    </Badge>
                                                                )}
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        setActiveRecordPatient({ id: patient.id, name: patient.display_name });
                                                                    }}
                                                                    className="h-7 px-2.5 gap-1.5 text-xs font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 shadow-2xs transition-all active:scale-95"
                                                                    title="Record Consult"
                                                                >
                                                                    <Mic className="h-3.5 w-3.5 text-rose-500" />
                                                                    <span>Record</span>
                                                                </Button>
                                                            </>
                                                        )}
                                                        <div className="text-slate-300 hover:text-slate-900 transition-colors">
                                                            <PatientRowActions
                                                                patientId={patient.id}
                                                                patientName={patient.display_name}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {displayedPatients.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="py-12 text-center text-muted-foreground border-dashed">
                                                <p className="mb-2">No patients found.</p>
                                                <p className="text-xs">Adjust your search or filters.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* --- MOBILE CARD LIST (visible only on mobile) --- */}
                        <div className="md:hidden space-y-3">
                            {displayedPatients.length === 0 && (
                                <div className="py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg bg-white">
                                    <p className="mb-2">No patients found.</p>
                                    <p className="text-xs">Adjust your search or filters.</p>
                                </div>
                            )}
                            {displayedPatients.map((patient) => {
                                const isTodayPatient = todayPatientIds.includes(patient.id);
                                const cached = artifactCache[patient.id];

                                return (
                                    <div
                                        key={patient.id}
                                        className={`bg-white border rounded-lg p-4 shadow-sm transition-all active:scale-[0.98] active:bg-slate-50 ${selectedIds.includes(patient.id) ? 'ring-2 ring-primary' : ''}`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                                <Checkbox
                                                    checked={selectedIds.includes(patient.id)}
                                                    onCheckedChange={() => toggleSelect(patient.id)}
                                                    className="mt-1"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <Link href={`/patient/${patient.id}`} className="block">
                                                        <h3 className="font-semibold text-slate-900 truncate">
                                                            {patient.display_name}
                                                        </h3>
                                                        {patient.referring_doctor && (
                                                            <p className="text-xs text-muted-foreground truncate">
                                                                Ref: {patient.referring_doctor}
                                                            </p>
                                                        )}
                                                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                                            <span>Seen: {patient.last_seen ? new Date(patient.last_seen).toLocaleDateString() : 'Never'}</span>
                                                            {patient.next_recall_date && (
                                                                <span className={new Date(patient.next_recall_date) < new Date() ? "text-red-500 font-medium" : ""}>
                                                                    Recall: {new Date(patient.next_recall_date).toLocaleDateString()}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </Link>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {viewMode === 'today' ? (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={(e) => handleRemoveFromTodayList(patient.id, e)}
                                                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-600 rounded-md"
                                                        title="Remove from Today's List"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </Button>
                                                ) : !isTodayPatient ? (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={(e) => handleAddToTodayList(patient.id, e)}
                                                        className="h-6 px-1.5 text-[10px] text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 gap-0.5 rounded"
                                                        title="Add to Today"
                                                    >
                                                        <Plus className="h-3 w-3" />
                                                        <span>Today</span>
                                                    </Button>
                                                ) : (
                                                    <Badge variant="outline" className="text-[9px] bg-indigo-50 text-indigo-700 border-indigo-200 h-5 px-1">
                                                        Today
                                                    </Badge>
                                                )}
                                                {(patient.pending_task_count || 0) > 0 && (
                                                    <Badge variant="default" className="bg-emerald-600 text-white text-[10px] h-5 px-1.5">
                                                        {patient.pending_task_count}T
                                                    </Badge>
                                                )}
                                                {(patient.suggested_items_count || 0) > 0 && (
                                                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px] h-5 px-1.5 border-amber-200">
                                                        {patient.suggested_items_count}S
                                                    </Badge>
                                                )}
                                                <PatientRowActions
                                                    patientId={patient.id}
                                                    patientName={patient.display_name}
                                                />
                                            </div>
                                        </div>

                                        {/* Mobile 1-Tap Record & Quick Actions */}
                                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                                            <Button
                                                size="sm"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setActiveRecordPatient({ id: patient.id, name: patient.display_name });
                                                }}
                                                className="flex-1 h-10 gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-semibold text-xs shadow-sm active:scale-[0.98] transition-all"
                                            >
                                                <Mic className="h-4 w-4" />
                                                Record Consult
                                            </Button>
                                            {patient.encounter_count > 0 && (
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    <QuickCopyButton
                                                        patientId={patient.id}
                                                        type="INTERNAL_NOTE"
                                                        label="Note"
                                                        cachedContent={cached?.internalNote}
                                                    />
                                                    <QuickCopyButton
                                                        patientId={patient.id}
                                                        type="REFERRER_LETTER"
                                                        label="Letter"
                                                        cachedContent={cached?.referrerLetter}
                                                    />
                                                    {cached?.patientSummary && (
                                                        <QuickCopyButton
                                                            patientId={patient.id}
                                                            type="PATIENT_SUMMARY"
                                                            label="Summary"
                                                            cachedContent={cached?.patientSummary}
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {/* Purpose-Built Mobile Consult Sheet */}
            {activeRecordPatient && (
                <MobileConsultSheet
                    open={!!activeRecordPatient}
                    onOpenChange={(open) => {
                        if (!open) setActiveRecordPatient(null);
                    }}
                    patientId={activeRecordPatient.id}
                    patientName={activeRecordPatient.name}
                    onGenerated={handleGenerated}
                />
            )}

            {/* Today's List Configuration Dialog */}
            <TodayListDialog
                open={isTodayDialogOpen}
                onOpenChange={setIsTodayDialogOpen}
                patients={initialPatients}
                selectedIds={todayPatientIds}
                onSaveList={handleSaveTodayList}
            />
        </div>
    );
}
