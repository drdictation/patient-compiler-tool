
'use client';

import { useState, useCallback, useEffect } from 'react';
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
import { Trash2, Merge, X, Search, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useDebounce } from 'use-debounce';

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
        router.push(`/?${params.toString()}`);
    }, [debouncedSearch, router, searchParams]); // searchParams in dep array might loop? No, default behavior is fine.

    // Sync Flags to URL
    const updateFilter = (key: string, val: boolean) => {
        const params = new URLSearchParams(searchParams.toString());
        if (val) params.set(key, 'true');
        else params.delete(key);
        router.push(`/?${params.toString()}`);
    };

    const updateSort = (val: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('sort', val);
        router.push(`/?${params.toString()}`);
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
        if (selectedIds.length === initialPatients.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(initialPatients.map(p => p.id));
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
            {/* --- SEARCH & FILTERS BAR --- */}
            <div className="bg-white p-3 md:p-4 rounded-lg border shadow-sm space-y-3 md:space-y-0 md:flex md:flex-row md:gap-4 md:items-center md:justify-between">

                {/* Search Input */}
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search name, referrer..."
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
                            Pending
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
                                        checked={selectedIds.length === initialPatients.length && initialPatients.length > 0}
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
                            {initialPatients.map((patient) => (
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
                                        <Link href={`/patient/${patient.id}`} className="hover:underline flex flex-col justify-center h-full w-full">
                                            <span>{patient.display_name}</span>
                                            {patient.referring_doctor && (
                                                <span className="text-[10px] text-muted-foreground font-normal">
                                                    Ref: {patient.referring_doctor}
                                                </span>
                                            )}
                                        </Link>
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
                                        {(patient.suggested_items_count || 0) > 0 && (
                                            <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] h-5 px-1.5">
                                                {patient.suggested_items_count} New
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <div className="flex justify-end items-center gap-4">
                                            <div className="text-slate-300 hover:text-slate-900 transition-colors">
                                                <PatientRowActions
                                                    patientId={patient.id}
                                                    patientName={patient.display_name}
                                                />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {initialPatients.length === 0 && (
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
                    {initialPatients.length === 0 && (
                        <div className="py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg bg-white">
                            <p className="mb-2">No patients found.</p>
                            <p className="text-xs">Adjust your search or filters.</p>
                        </div>
                    )}
                    {initialPatients.map((patient) => (
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
                                    <Link href={`/patient/${patient.id}`} className="flex-1 min-w-0">
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
                                <div className="flex items-center gap-2">
                                    {(patient.suggested_items_count || 0) > 0 && (
                                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px] h-5 px-1.5">
                                            {patient.suggested_items_count}
                                        </Badge>
                                    )}
                                    <PatientRowActions
                                        patientId={patient.id}
                                        patientName={patient.display_name}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
