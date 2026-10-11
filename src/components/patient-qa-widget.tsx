'use client';

import React, { useState } from 'react';
import { Sparkles, Send, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PatientQaWidgetProps {
    patientId: string;
    patientName: string;
}

export function PatientQaWidget({ patientId, patientName }: PatientQaWidgetProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<Array<{ q: string; a: string }>>([]);

    async function handleAsk(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = query.trim();
        if (!trimmed || loading) return;

        setLoading(true);
        setQuery('');

        try {
            const res = await fetch(`/api/patient/${patientId}/qa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: trimmed }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Request failed');

            setHistory(prev => [{ q: trimmed, a: data.answer }, ...prev]);
        } catch (err: any) {
            setHistory(prev => [{ q: trimmed, a: `Error: ${err.message}` }, ...prev]);
        } finally {
            setLoading(false);
        }
    }

    if (!open) {
        return (
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                className="gap-1.5 text-xs font-medium border-violet-200 text-violet-700 hover:bg-violet-50 bg-white"
            >
                <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                Ask GPT-6
            </Button>
        );
    }

    return (
        <div className="relative">
            {/* Popover / Collapsible drawer */}
            <div className="absolute right-0 top-0 z-50 w-80 sm:w-96 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
                <div className="flex items-center justify-between pb-2 mb-2 border-b">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                        <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                        Ask GPT-6-luna ({patientName})
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-slate-400 hover:text-slate-600"
                        onClick={() => setOpen(false)}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>

                <form onSubmit={handleAsk} className="flex gap-1.5 mb-2">
                    <Input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="e.g. Did patient take Azathioprine?"
                        className="h-8 text-xs"
                        autoFocus
                        disabled={loading}
                    />
                    <Button type="submit" size="sm" className="h-8 px-2.5 bg-violet-600 hover:bg-violet-700 text-white" disabled={loading || !query.trim()}>
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                </form>

                {history.length > 0 && (
                    <div className="max-h-56 overflow-y-auto space-y-2 pt-1 text-xs divide-y divide-slate-100">
                        {history.map((item, idx) => (
                            <div key={idx} className="pt-2 first:pt-0">
                                <p className="font-medium text-slate-700">Q: {item.q}</p>
                                <p className="text-slate-900 font-semibold bg-violet-50/70 p-1.5 rounded mt-0.5 border border-violet-100/60">
                                    {item.a}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
