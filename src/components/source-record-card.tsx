
'use client';

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mic, Bot, Copy, Check, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface SourceRecord {
    id: string;
    heroku_id: number;
    created_at_heroku: string;
    transcription?: string;
    ai_formatted_transcription?: string;
}

export function SourceRecordCard({ record }: { record: SourceRecord }) {
    const [copied, setCopied] = useState(false);
    const [copiedSummary, setCopiedSummary] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const router = useRouter();

    const handleCopy = () => {
        const textToCopy = record.transcription || "";
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy);
            toast.success("Raw dictation copied");
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleCopySummary = () => {
        const textToCopy = record.ai_formatted_transcription || "";
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy);
            toast.success("AI Summary copied");
            setCopiedSummary(true);
            setTimeout(() => setCopiedSummary(false), 2000);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this specific dictation record?')) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/record/${record.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            toast.success('Record deleted');
            router.refresh();
        } catch (e) {
            toast.error('Delete failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="bg-slate-50/80 border-slate-200 shadow-sm transition-all hover:shadow-md group/card">
            <CardHeader className="py-2 px-4 border-b border-slate-100 flex flex-row items-center justify-between space-y-0">
                <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                    <Mic className="h-3.5 w-3.5" />
                    Recorded {new Date(record.created_at_heroku).toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit' })} Melbourne time
                </span>
                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] bg-white border-slate-200">
                        Dr Dictation ID: {record.heroku_id}
                    </Badge>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-indigo-600"
                        onClick={() => setIsExpanded(value => !value)}
                    >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                        {isExpanded ? 'Hide transcript' : 'Show transcript'}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover/card:opacity-100 transition-opacity text-slate-400 hover:text-primary"
                        onClick={handleCopy}
                        title="Copy Raw Transcription"
                    >
                        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover/card:opacity-100 transition-opacity text-red-300 hover:text-red-500 hover:bg-red-50"
                        onClick={handleDelete}
                        disabled={loading}
                        title="Delete Record"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </CardHeader>
            {isExpanded && <CardContent className="py-3 px-4 text-sm text-slate-700 leading-relaxed">
                <p className="whitespace-pre-wrap font-serif">
                    {record.transcription}
                </p>

                {record.ai_formatted_transcription && (
                    <div className="mt-3 bg-purple-50/50 rounded-md p-3 border border-purple-100 group/summary">
                        <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-purple-700 font-semibold flex items-center gap-1.5">
                                <Bot className="h-3 w-3" /> AI Summary
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1.5 text-[10px] text-purple-600 hover:text-purple-800 hover:bg-purple-100 opacity-0 group-hover/summary:opacity-100 transition-opacity"
                                onClick={handleCopySummary}
                            >
                                {copiedSummary ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                                {copiedSummary ? "Copied" : "Copy Summary"}
                            </Button>
                        </div>
                        <p className="text-xs text-purple-900/80 whitespace-pre-wrap">
                            {record.ai_formatted_transcription}
                        </p>
                    </div>
                )}
            </CardContent>}
        </Card>
    );
}
