
'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search as SearchIcon, FileText, Mic, Calendar, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';

interface Result {
    type: 'source' | 'artifact';
    id: string;
    patient_id: string;
    patient_name: string;
    patient_identity: string;
    date: string;
    title: string;
    snippet: string;
}

function SearchContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const initialQuery = searchParams.get('q') || '';

    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<Result[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState('');

    // Debounced search effect could go here, but for now we search on submit or empty
    useEffect(() => {
        if (initialQuery) {
            performSearch(initialQuery);
        }
    }, [initialQuery]);

    const performSearch = async (term: string) => {
        if (!term.trim()) return;
        setLoading(true);
        setSearched(true);
        setError('');

        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Search failed');
            }

            setResults(data.results || []);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        router.push(`/search?q=${encodeURIComponent(query)}`);
    };

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/">
                    <Button variant="ghost" size="icon" className="-ml-2">
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                </Link>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <SearchIcon className="h-8 w-8" />
                    Full-Text Search
                </h1>
            </div>

            <form onSubmit={handleSubmit} className="flex gap-4 mb-8">
                <Input
                    className="text-lg py-6"
                    placeholder="Search for diagnosis, medication, patient name..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                />
                <Button size="lg" type="submit" disabled={loading}>
                    {loading ? 'Searching...' : 'Search'}
                </Button>
            </form>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{error}</span>
                </div>
            )}

            <div className="space-y-4">
                {searched && results.length === 0 && !loading && (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-gray-50">
                        No results found for "{initialQuery}".
                    </div>
                )}

                {results.map((result) => (
                    <Link key={`${result.type}-${result.id}`} href={`/patient/${result.patient_id}`}>
                        <Card className="hover:shadow-md transition-shadow cursor-pointer bg-white">
                            <CardHeader className="py-3 bg-slate-50/50">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-base font-semibold text-primary flex items-center gap-2">
                                            {result.patient_name}
                                            <span className="text-xs font-normal text-muted-foreground">({result.patient_identity})</span>
                                        </CardTitle>
                                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                            <Calendar className="h-3 w-3" />
                                            {new Date(result.date).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <Badge variant={result.type === 'source' ? 'secondary' : 'default'} className="text-xs">
                                        {result.type === 'source' ? 'Dictation' : 'Note/Letter'}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="py-3">
                                <div className="text-sm text-slate-700">
                                    <span className="font-semibold text-xs text-slate-500 uppercase tracking-wider mr-2">
                                        Match found in {result.title}:
                                    </span>
                                    <p className="mt-1 line-clamp-2 italic border-l-2 border-slate-200 pl-3">
                                        "{result.snippet}..."
                                    </p>
                                </div>
                                <div className="flex justify-end mt-2">
                                    <div className="text-xs text-blue-600 flex items-center gap-1 font-medium hover:underline">
                                        Go to Patient <ArrowRight className="h-3 w-3" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}

function SearchFallback() {
    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl flex items-center justify-center min-h-[50vh]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
    );
}

export default function SearchPage() {
    return (
        <Suspense fallback={<SearchFallback />}>
            <SearchContent />
        </Suspense>
    );
}
