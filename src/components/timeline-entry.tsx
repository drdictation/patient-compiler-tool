'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Calendar, ChevronDown, ChevronUp, FileText, Mic, MessageSquare, ScrollText
} from 'lucide-react';
import { SourceRecordCard } from '@/components/source-record-card';
import { ArtifactSection } from '@/components/artifact-section';

interface SourceRecord {
    id: string;
    heroku_id: number;
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
    artifact_type: 'RAW_TRANSCRIPT' | 'INTERNAL_NOTE' | 'REFERRER_LETTER';
    current_version: number;
    versions: Version[];
}

interface Encounter {
    id: string;
    encounter_date: string;
    source_records: SourceRecord[];
    artifacts: Artifact[];
}

interface TimelineEntryProps {
    encounter: Encounter;
    isLast: boolean;
}

function generateSummary(encounter: Encounter): string {
    // Try to get a summary from the first source record's AI formatted transcription
    const firstRecord = encounter.source_records[0];
    if (firstRecord?.ai_formatted_transcription) {
        // Take first sentence or first 100 chars
        const text = firstRecord.ai_formatted_transcription;
        const firstSentence = text.split(/[.!?]/)[0];
        if (firstSentence && firstSentence.length <= 120) {
            return firstSentence.trim() + '.';
        }
        return text.substring(0, 100).trim() + '...';
    }

    // Fallback to raw transcription
    if (firstRecord?.transcription) {
        const text = firstRecord.transcription;
        return text.length > 80 ? text.substring(0, 80).trim() + '...' : text;
    }

    // Default
    return 'Clinical encounter recorded.';
}

export function TimelineEntry({ encounter, isLast }: TimelineEntryProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const date = new Date(encounter.encounter_date);
    const formattedDate = date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });

    const summary = generateSummary(encounter);
    const recordCount = encounter.source_records.length;
    const hasTranscript = encounter.artifacts.some(a => a.artifact_type === 'RAW_TRANSCRIPT' && a.versions.length > 0);
    const hasNotes = encounter.artifacts.some(a => a.artifact_type === 'INTERNAL_NOTE' && a.versions.length > 0);
    const hasLetters = encounter.artifacts.some(a => a.artifact_type === 'REFERRER_LETTER' && a.versions.length > 0);

    if (!isExpanded) {
        // Collapsed view - compact card
        return (
            <div className="flex gap-4 relative group">
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-indigo-500 border-2 border-white shadow-sm flex-shrink-0" />
                    {!isLast && (
                        <div className="w-px flex-1 bg-gradient-to-b from-indigo-200 to-transparent min-h-[60px]" />
                    )}
                </div>

                {/* Collapsed Card */}
                <Card
                    className="flex-1 mb-4 cursor-pointer hover:shadow-md transition-all border-slate-200 hover:border-indigo-200 group/card"
                    onClick={() => setIsExpanded(true)}
                >
                    <CardHeader className="py-3 px-4 flex flex-row items-start justify-between space-y-0">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-slate-800">{formattedDate}</span>
                                <span className="text-slate-400 text-sm">{dayOfWeek}</span>
                                {recordCount > 0 && (
                                    <Badge variant="secondary" className="text-[10px] h-5 bg-slate-100">
                                        <Mic className="h-2.5 w-2.5 mr-1" />
                                        {recordCount} dictation{recordCount > 1 ? 's' : ''}
                                    </Badge>
                                )}
                                {hasNotes && (
                                    <Badge variant="secondary" className="text-[10px] h-5 bg-blue-50 text-blue-700">
                                        <FileText className="h-2.5 w-2.5 mr-1" />
                                        Notes
                                    </Badge>
                                )}
                                {hasTranscript && (
                                    <Badge variant="secondary" className="text-[10px] h-5 bg-amber-50 text-amber-700">
                                        <ScrollText className="h-2.5 w-2.5 mr-1" />
                                        Transcript
                                    </Badge>
                                )}
                                {hasLetters && (
                                    <Badge variant="secondary" className="text-[10px] h-5 bg-purple-50 text-purple-700">
                                        <MessageSquare className="h-2.5 w-2.5 mr-1" />
                                        Letter
                                    </Badge>
                                )}
                            </div>
                            <p className="text-sm text-slate-600 mt-1.5 line-clamp-2">{summary}</p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-slate-400 group-hover/card:text-indigo-600 transition-colors ml-2"
                        >
                            <ChevronDown className="h-4 w-4" />
                        </Button>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    // Expanded view - full details
    return (
        <div className="flex gap-4 relative group">
            {/* Timeline connector */}
            <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-indigo-600 border-2 border-indigo-100 shadow-md flex-shrink-0" />
                {!isLast && (
                    <div className="w-px flex-1 bg-gradient-to-b from-indigo-300 to-indigo-100 min-h-[100px]" />
                )}
            </div>

            {/* Expanded Card */}
            <Card className="flex-1 mb-4 border-indigo-200 shadow-lg">
                <CardHeader className="py-3 px-4 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-indigo-100 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-indigo-600" />
                        <div>
                            <span className="font-bold text-lg text-slate-800">{formattedDate}</span>
                            <span className="text-slate-400 text-sm ml-2">{dayOfWeek}</span>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsExpanded(false)}
                        className="h-7 px-2 text-indigo-600 hover:text-indigo-800"
                    >
                        <ChevronUp className="h-4 w-4 mr-1" />
                        Collapse
                    </Button>
                </CardHeader>

                <CardContent className="py-4 px-4 space-y-4">
                    {/* SOURCE DICTATIONS */}
                    {encounter.source_records.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <div className="h-px bg-gray-200 flex-1" />
                                Source Dictations ({encounter.source_records.length})
                                <div className="h-px bg-gray-200 flex-1" />
                            </h4>

                            {encounter.source_records.map((record) => (
                                <SourceRecordCard key={record.id} record={record} />
                            ))}
                        </div>
                    )}

                    {/* SMART NOTE TRANSCRIPT */}
                    {hasTranscript && (
                        <div className="space-y-3">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Transcript
                            </h4>
                            <ArtifactSection
                                encounterId={encounter.id}
                                type="RAW_TRANSCRIPT"
                                initialArtifact={encounter.artifacts.find(a => a.artifact_type === 'RAW_TRANSCRIPT')}
                                readOnly
                            />
                        </div>
                    )}

                    {/* INTERNAL NOTES */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Internal Notes
                        </h4>
                        <ArtifactSection
                            encounterId={encounter.id}
                            type="INTERNAL_NOTE"
                            initialArtifact={encounter.artifacts.find(a => a.artifact_type === 'INTERNAL_NOTE')}
                        />
                    </div>

                    {/* REFERRER LETTERS */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Referrer Letters
                        </h4>
                        <ArtifactSection
                            encounterId={encounter.id}
                            type="REFERRER_LETTER"
                            initialArtifact={encounter.artifacts.find(a => a.artifact_type === 'REFERRER_LETTER')}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
