'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, ScrollText, Mic, Copy, Check, Calendar, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface SourceRecord {
    id: string;
    created_at_heroku: string;
    transcription?: string;
    ai_formatted_transcription?: string;
}

interface Version {
    version_number: number;
    content: string;
    created_at: string;
}

interface Artifact {
    id: string;
    artifact_type: 'RAW_TRANSCRIPT' | 'INTERNAL_NOTE' | 'REFERRER_LETTER' | 'REFERRAL_LETTER' | 'PATIENT_SUMMARY';
    current_version: number;
    versions: Version[];
}

interface Encounter {
    id: string;
    encounter_date: string;
    source_records: SourceRecord[];
    artifacts: Artifact[];
}

interface TranscriptsPanelProps {
    patientName: string;
    timeline: Encounter[];
}

export function TranscriptsPanel({ patientName, timeline }: TranscriptsPanelProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Filter encounters that have transcripts or dictations
    const encountersWithTranscripts = timeline.filter(encounter => {
        const hasRawTranscript = encounter.artifacts.some(
            a => a.artifact_type === 'RAW_TRANSCRIPT' && a.versions.length > 0
        );
        const hasSourceRecords = encounter.source_records.some(r => r.transcription);
        return hasRawTranscript || hasSourceRecords;
    });

    // Filter based on search query
    const filteredEncounters = encountersWithTranscripts.filter(encounter => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();

        // Check date
        const date = new Date(encounter.encounter_date);
        const formattedDate = date.toLocaleDateString('en-AU', {
            day: 'numeric', month: 'short', year: 'numeric', weekday: 'long'
        }).toLowerCase();
        if (formattedDate.includes(query)) return true;

        // Check transcript content
        const transcriptArtifact = encounter.artifacts.find(a => a.artifact_type === 'RAW_TRANSCRIPT');
        const latestVersion = transcriptArtifact?.versions.find(v => v.version_number === transcriptArtifact.current_version) || transcriptArtifact?.versions[0];
        if (latestVersion?.content && latestVersion.content.toLowerCase().includes(query)) return true;

        // Check dictations
        const dictationsMatch = encounter.source_records.some(r => r.transcription?.toLowerCase().includes(query));
        if (dictationsMatch) return true;

        return false;
    });

    const handleCopy = async (text: string, id: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Transcript copied to clipboard');
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy transcript:', err);
            toast.error('Failed to copy to clipboard');
        }
    };

    return (
        <Card className="w-full border-slate-200 shadow-sm print:hidden">
            <CardHeader className="py-4 px-6 border-b bg-gradient-to-r from-slate-50 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <ScrollText className="h-5 w-5 text-indigo-600" />
                    <div>
                        <CardTitle className="text-lg font-bold text-slate-800">Saved Transcripts & Dictations</CardTitle>
                        <p className="text-xs text-slate-500">View and search through past consultation transcripts for {patientName}</p>
                    </div>
                </div>
                {encountersWithTranscripts.length > 0 && (
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search transcripts..."
                            className="pl-9 h-9 text-sm border-slate-200 focus:border-indigo-400"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                )}
            </CardHeader>
            <CardContent className="p-6">
                {encountersWithTranscripts.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 border-2 border-dashed rounded-lg bg-slate-50/50 flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="h-8 w-8 text-slate-300" />
                        <span className="text-sm font-medium">No transcripts or dictations found for this patient.</span>
                    </div>
                ) : filteredEncounters.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 flex flex-col items-center justify-center gap-2">
                        <Search className="h-8 w-8 text-slate-300" />
                        <span className="text-sm font-medium">No matches found for "{searchQuery}".</span>
                    </div>
                ) : (
                    <ScrollArea className="h-[450px] pr-4">
                        <div className="space-y-6">
                            {filteredEncounters.map((encounter) => {
                                const date = new Date(encounter.encounter_date);
                                const formattedDate = date.toLocaleDateString('en-AU', {
                                    day: 'numeric', month: 'short', year: 'numeric', weekday: 'long'
                                });

                                const transcriptArt = encounter.artifacts.find(a => a.artifact_type === 'RAW_TRANSCRIPT');
                                const latestVersion = transcriptArt?.versions.find(v => v.version_number === transcriptArt.current_version) || transcriptArt?.versions[0];
                                const transcriptContent = latestVersion?.content || '';

                                return (
                                    <div key={encounter.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white hover:shadow-sm transition-shadow">
                                        <div className="bg-slate-50/80 px-4 py-2.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-4 w-4 text-indigo-500" />
                                                <span className="text-sm font-semibold text-slate-800">{formattedDate}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {transcriptContent && (
                                                    <Badge variant="secondary" className="text-[10px] bg-amber-50 text-amber-700 hover:bg-amber-50">
                                                        <ScrollText className="h-3 w-3 mr-1" /> Smart Note
                                                    </Badge>
                                                )}
                                                {encounter.source_records.length > 0 && (
                                                    <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-50">
                                                        <Mic className="h-3 w-3 mr-1" /> {encounter.source_records.length} Dictation(s)
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-4 space-y-4">
                                            {/* Smart Note Transcript */}
                                            {transcriptContent && (
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Smart Note Transcript</span>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 px-2 text-[10px] text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 gap-1"
                                                            onClick={() => handleCopy(transcriptContent, `${encounter.id}-smart`)}
                                                        >
                                                            {copiedId === `${encounter.id}-smart` ? (
                                                                <>
                                                                    <Check className="h-3.5 w-3.5 text-green-600" />
                                                                    <span>Copied</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Copy className="h-3 w-3" />
                                                                    <span>Copy</span>
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>
                                                    <div className="bg-slate-50 rounded-md p-3.5 border border-slate-100 max-h-40 overflow-y-auto">
                                                        <p className="text-xs font-serif text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                            {transcriptContent}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Raw Dictations */}
                                            {encounter.source_records.length > 0 && (
                                                <div className="space-y-2">
                                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Raw Dictations</span>
                                                    <div className="space-y-2.5">
                                                        {encounter.source_records.map((record, idx) => (
                                                            <div key={record.id} className="border border-indigo-50/50 rounded-md bg-indigo-50/10 p-3">
                                                                <div className="flex items-center justify-between mb-1.5">
                                                                    <span className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1">
                                                                        <Mic className="h-3 w-3" /> Dictation #{idx + 1}
                                                                    </span>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-5 px-1.5 text-[9px] text-indigo-500 hover:text-indigo-700 gap-1"
                                                                        onClick={() => handleCopy(record.transcription || '', record.id)}
                                                                    >
                                                                        {copiedId === record.id ? (
                                                                            <>
                                                                                <Check className="h-3 w-3 text-green-600" />
                                                                                <span>Copied</span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <Copy className="h-3 w-3" />
                                                                                <span>Copy</span>
                                                                            </>
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                                <p className="text-xs font-serif text-slate-600 whitespace-pre-wrap leading-relaxed pl-1">
                                                                    {record.transcription}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    );
}
