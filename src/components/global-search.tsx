
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, User, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useDebounce } from 'use-debounce';

interface PatientResult {
    id: string;
    display_name: string;
    date_of_birth: string | null;
}

export function GlobalSearch() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [debouncedQuery] = useDebounce(query, 300);
    const [results, setResults] = useState<PatientResult[]>([]);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (debouncedQuery.length < 2) {
            setResults([]);
            return;
        }

        const fetchResults = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/patient/search?q=${encodeURIComponent(debouncedQuery)}`);
                const data = await res.json();
                setResults(data.patients || []);
            } catch (err) {
                console.error('Search failed:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchResults();
    }, [debouncedQuery]);

    const handleSelect = (patientId: string) => {
        setOpen(false);
        setQuery('');
        router.push(`/patient/${patientId}`);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div className="relative group cursor-pointer">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground transition-colors group-hover:text-foreground">
                        <Search className="h-4 w-4" />
                    </div>
                    <div className="h-9 w-full md:w-64 lg:w-80 rounded-md border border-input bg-background/50 pl-10 pr-4 py-2 text-sm text-muted-foreground transition-all group-hover:bg-background group-hover:ring-1 group-hover:ring-ring flex items-center gap-2">
                        <span>Search patients...</span>
                        <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-auto">
                            <span className="text-xs">⌘</span>K
                        </kbd>
                    </div>
                </div>
            </PopoverTrigger>
            <PopoverContent
                className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[300px]"
                align="start"
                onOpenAutoFocus={(e) => {
                    inputRef.current?.focus();
                }}
            >
                <div className="flex flex-col">
                    <div className="p-3 border-b flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <Input
                            ref={inputRef}
                            placeholder="Type patient name..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="h-8 border-none focus-visible:ring-0 px-0"
                        />
                        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                        {results.length > 0 ? (
                            <div className="py-1">
                                {results.map((patient) => (
                                    <button
                                        key={patient.id}
                                        className="w-full flex flex-col px-4 py-2 text-left hover:bg-accent hover:text-accent-foreground transition-colors"
                                        onClick={() => handleSelect(patient.id)}
                                    >
                                        <div className="flex items-center gap-2 font-medium">
                                            <User className="h-3.5 w-3.5" />
                                            {patient.display_name}
                                        </div>
                                        {patient.date_of_birth && (
                                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                                                <Calendar className="h-3 w-3" />
                                                DOB: {new Date(patient.date_of_birth).toLocaleDateString()}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : query.length >= 2 && !loading ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                                No patients found for "{query}"
                            </div>
                        ) : query.length < 2 ? (
                            <div className="p-4 text-center text-xs text-muted-foreground">
                                Use <kbd className="font-sans">⌘K</kbd> to focus. Search by name.
                            </div>
                        ) : null}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
