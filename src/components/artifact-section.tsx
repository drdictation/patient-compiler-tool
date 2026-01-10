'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Plus, Save, X, FileText, Mail, History, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface Version {
    version_number: number;
    content: string;
    created_at: string;
}

interface Artifact {
    id: string;
    artifact_type: 'INTERNAL_NOTE' | 'REFERRER_LETTER';
    current_version: number;
    versions: Version[];
}

interface ArtifactSectionProps {
    encounterId: string;
    type: 'INTERNAL_NOTE' | 'REFERRER_LETTER';
    initialArtifact?: Artifact;
}

export function ArtifactSection({ encounterId, type, initialArtifact }: ArtifactSectionProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [content, setContent] = useState(initialArtifact?.versions.find(v => v.version_number === initialArtifact.current_version)?.content || '');
    const [loading, setLoading] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/artifact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ encounterId, artifactType: type, content }),
            });

            if (!res.ok) throw new Error('Failed to save');

            setIsEditing(false);
            router.refresh(); // Refresh server data
            toast.success('Saved successfully');
        } catch (e) {
            toast.error('Error saving artifact');
        } finally {
            setLoading(false);
        }
    };

    const currentVersionContent = initialArtifact?.versions.find(v => v.version_number === initialArtifact.current_version)?.content;
    const hasContent = !!initialArtifact;
    const label = type === 'INTERNAL_NOTE' ? 'Internal Note' : 'Referrer Letter';
    const Icon = type === 'INTERNAL_NOTE' ? FileText : Mail;

    const handleCopy = async () => {
        if (contentRef.current) {
            try {
                // Get the rendered HTML content
                const html = contentRef.current.innerHTML;
                const text = contentRef.current.innerText;

                // Create a ClipboardItem with both HTML and plain text
                const blob = new Blob([html], { type: 'text/html' });
                const textBlob = new Blob([text], { type: 'text/plain' });

                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': blob,
                        'text/plain': textBlob,
                    })
                ]);
                toast.success(`${label} copied with formatting`);
            } catch {
                // Fallback for browsers that don't support ClipboardItem
                if (currentVersionContent) {
                    await navigator.clipboard.writeText(currentVersionContent);
                    toast.success(`${label} copied to clipboard (plain text)`);
                }
            }
        }
    };

    // READ MODE
    if (hasContent && !isEditing) {
        return (
            <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="py-2 px-4 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                        <Icon className="h-4 w-4" />
                        {label}
                        <Badge variant="secondary" className="text-[10px] h-5">v{initialArtifact.current_version}</Badge>
                    </CardTitle>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleCopy} title="Copy to Clipboard">
                            <Copy className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowHistory(!showHistory)} title="History">
                            <History className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                            setContent(currentVersionContent || '');
                            setIsEditing(true);
                        }}>
                            Edit
                        </Button>
                    </div>
                </CardHeader>
                <CardContent
                    ref={contentRef}
                    className="py-3 px-4 text-sm font-sans text-slate-800 markdown-content"
                >
                    <ReactMarkdown>{currentVersionContent || ''}</ReactMarkdown>
                </CardContent>

                {/* History View */}
                {showHistory && (
                    <CardFooter className="flex-col items-start pt-0 pb-3 gap-2 border-t mt-2">
                        <p className="text-xs font-semibold text-muted-foreground mt-2">Version History</p>
                        {initialArtifact.versions.sort((a, b) => b.version_number - a.version_number).map(v => (
                            <div key={v.version_number} className="text-xs text-muted-foreground w-full flex justify-between">
                                <span>v{v.version_number} - {new Date(v.created_at).toLocaleString()}</span>
                            </div>
                        ))}
                    </CardFooter>
                )}
            </Card>
        );
    }

    // EDIT MODE
    if (isEditing) {
        return (
            <Card className="border-blue-200 ring-2 ring-blue-100">
                <CardHeader className="py-2 px-4 border-b border-blue-50 bg-blue-50/30">
                    <CardTitle className="text-sm font-medium text-blue-800">
                        {hasContent ? `Editing ${label} (v${initialArtifact.current_version + 1} Draft)` : `New ${label}`}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Textarea
                        className="min-h-[150px] border-0 focus-visible:ring-0 resize-y p-4 font-sans text-sm"
                        placeholder={`Type your ${label.toLowerCase()} here...`}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        autoFocus
                    />
                </CardContent>
                <CardFooter className="py-2 px-4 bg-gray-50 flex justify-end gap-2 border-t">
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={loading} className="gap-2">
                        <Save className="h-4 w-4" />
                        {loading ? 'Saving...' : 'Save Version'}
                    </Button>
                </CardFooter>
            </Card>
        );
    }

    // EMPTY STATE ("Add New")
    // EMPTY STATE ("Add New")
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="h-7 text-xs text-muted-foreground hover:text-primary hover:bg-slate-100 border border-dashed border-slate-200 w-full justify-start font-normal opacity-70 hover:opacity-100 mb-2"
        >
            <Plus className="h-3 w-3 mr-2" />
            Add {label}
        </Button>
    );
}
