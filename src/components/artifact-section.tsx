'use client';

import React, { useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Plus, Save, FileText, Mail, History, Copy, ScrollText, AlertTriangle, Edit3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { scanLetterRiskPhrases } from '@/lib/generation/letter-risk-phrases';

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

interface ArtifactSectionProps {
    encounterId: string;
    type: 'RAW_TRANSCRIPT' | 'INTERNAL_NOTE' | 'REFERRER_LETTER' | 'REFERRAL_LETTER' | 'PATIENT_SUMMARY';
    initialArtifact?: Artifact;
    readOnly?: boolean;
}

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(text: string, regex: RegExp | null): React.ReactNode {
    if (!regex) return text;
    const parts = text.split(regex);
    if (parts.length <= 1) return text;
    return parts.map((part, idx) =>
        idx % 2 === 1 ? (
            <mark
                key={idx}
                data-risk-highlight="true"
                className="bg-red-200 text-red-950 font-semibold px-0.5 rounded"
            >
                {part}
            </mark>
        ) : (
            part
        )
    );
}

function highlightChildren(children: React.ReactNode, regex: RegExp | null): React.ReactNode {
    if (!regex) return children;
    return React.Children.map(children, (child) => {
        if (typeof child === 'string') {
            return renderHighlightedText(child, regex);
        }
        if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.props?.children) {
            return React.cloneElement(child, {
                children: highlightChildren(child.props.children, regex),
            });
        }
        return child;
    });
}

export function ArtifactSection({ encounterId, type, initialArtifact, readOnly = false }: ArtifactSectionProps) {
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
            router.refresh();
            toast.success('Saved successfully');
        } catch {
            toast.error('Error saving artifact');
        } finally {
            setLoading(false);
        }
    };

    const currentVersionContent = initialArtifact?.versions.find(v => v.version_number === initialArtifact.current_version)?.content;
    const hasContent = !!initialArtifact;
    const isLetterType = type === 'REFERRER_LETTER' || type === 'REFERRAL_LETTER';

    const riskMatches = useMemo(() => {
        if (!isLetterType || !currentVersionContent) return [];
        return scanLetterRiskPhrases(currentVersionContent);
    }, [isLetterType, currentVersionContent]);

    const highlightRegex = useMemo(() => {
        if (riskMatches.length === 0) return null;
        const uniqueNeedles = Array.from(new Set(riskMatches.map(m => m.matchedText).filter(Boolean)));
        if (uniqueNeedles.length === 0) return null;
        // Sort longest first so longer phrases match before shorter subphrases
        uniqueNeedles.sort((a, b) => b.length - a.length);
        return new RegExp(`(${uniqueNeedles.map(escapeRegExp).join('|')})`, 'gi');
    }, [riskMatches]);

    const label = type === 'RAW_TRANSCRIPT' ? 'Transcript'
        : type === 'INTERNAL_NOTE' ? 'Internal Note'
        : type === 'REFERRER_LETTER' ? 'Referrer Letter'
        : type === 'REFERRAL_LETTER' ? 'Referral Letter (Outbound)'
        : 'Patient Summary';
    const Icon = type === 'RAW_TRANSCRIPT' ? ScrollText
        : type === 'INTERNAL_NOTE' ? FileText
        : type === 'REFERRER_LETTER' ? Mail
        : type === 'REFERRAL_LETTER' ? Mail
        : FileText;

    const handleCopy = async () => {
        if (contentRef.current) {
            try {
                const clone = contentRef.current.cloneNode(true) as HTMLElement;

                // Strip inline risk-highlight <mark> tags so copied HTML stays clean for EMRs
                clone.querySelectorAll('mark[data-risk-highlight]').forEach((mark) => {
                    const textNode = document.createTextNode(mark.textContent || '');
                    mark.parentNode?.replaceChild(textNode, mark);
                });

                const baseStyle = 'font-family: Arial, sans-serif; font-size: 10pt;';
                clone.style.cssText = baseStyle;

                clone.querySelectorAll('p').forEach((p) => {
                    (p as HTMLElement).style.cssText = `${baseStyle} margin: 6pt 0;`;
                });

                clone.querySelectorAll('ul, ol').forEach((list) => {
                    (list as HTMLElement).style.cssText = `${baseStyle} margin-left: 24pt; padding-left: 0; margin-top: 6pt; margin-bottom: 6pt;`;
                });

                clone.querySelectorAll('li').forEach((li) => {
                    (li as HTMLElement).style.cssText = `${baseStyle} margin: 3pt 0;`;
                });

                clone.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
                    (h as HTMLElement).style.cssText = `${baseStyle} font-weight: bold; margin-top: 12pt; margin-bottom: 6pt;`;
                });

                clone.querySelectorAll('strong, b').forEach((s) => {
                    (s as HTMLElement).style.cssText = `${baseStyle} font-weight: bold;`;
                });

                const html = clone.innerHTML;
                const text = contentRef.current.innerText;

                const blob = new Blob([`<div style="${baseStyle}">${html}</div>`], { type: 'text/html' });
                const textBlob = new Blob([text], { type: 'text/plain' });

                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': blob,
                        'text/plain': textBlob,
                    })
                ]);
                if (riskMatches.length > 0) {
                    toast.warning(`${label} copied — contains ${riskMatches.length} flagged phrase(s)`);
                } else {
                    toast.success(`${label} copied with formatting`);
                }
            } catch {
                if (currentVersionContent) {
                    await navigator.clipboard.writeText(currentVersionContent);
                    toast.success(`${label} copied to clipboard (plain text)`);
                }
            }
        }
    };

    const isFlagged = riskMatches.length > 0;

    // READ MODE
    if (hasContent && !isEditing) {
        return (
            <Card className={isFlagged
                ? 'border-l-4 border-l-red-500 border-red-200 bg-red-50/30 shadow-sm hover:shadow-md transition-shadow'
                : 'border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow'
            }>
                <CardHeader className="py-2 px-4 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${isFlagged ? 'text-red-800' : 'text-slate-700'}`}>
                        <Icon className="h-4 w-4" />
                        {label}
                        <Badge variant="secondary" className="text-[10px] h-5">v{initialArtifact.current_version}</Badge>
                        {isFlagged && (
                            <Badge variant="destructive" className="text-[10px] h-5 gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Review Flagged ({riskMatches.length})
                            </Badge>
                        )}
                    </CardTitle>
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 w-7 p-0 ${isFlagged ? 'text-red-700 hover:bg-red-100' : ''}`}
                            onClick={handleCopy}
                            title="Copy to Clipboard"
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowHistory(!showHistory)} title="History">
                            <History className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        {!readOnly && (
                            <Button
                                variant={isFlagged ? 'destructive' : 'ghost'}
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                    setContent(currentVersionContent || '');
                                    setIsEditing(true);
                                }}
                            >
                                {isFlagged && <Edit3 className="h-3 w-3" />}
                                {isFlagged ? 'Edit to Fix' : 'Edit'}
                            </Button>
                        )}
                    </div>
                </CardHeader>

                {isFlagged && (
                    <div className="mx-4 mb-1 rounded-lg border border-red-200 bg-red-100/70 px-3 py-2 text-xs text-red-900 space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-red-700 flex-shrink-0" />
                            <span>Flagged phrases detected — review before sending to GP:</span>
                        </div>
                        <ul className="list-disc pl-5 space-y-0.5 text-red-800">
                            {riskMatches.map((m, idx) => (
                                <li key={idx}>
                                    <span className="font-semibold">&ldquo;{m.matchedText}&rdquo;</span>
                                    <span className="text-red-700"> — {m.label}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <CardContent
                    ref={contentRef}
                    className="py-3 px-4 text-sm font-sans text-slate-800 markdown-content"
                >
                    {type === 'RAW_TRANSCRIPT' ? (
                        <p className="whitespace-pre-wrap font-serif">{currentVersionContent || ''}</p>
                    ) : (
                        <ReactMarkdown
                            components={highlightRegex ? {
                                p: ({ children }) => <p>{highlightChildren(children, highlightRegex)}</p>,
                                li: ({ children }) => <li>{highlightChildren(children, highlightRegex)}</li>,
                                strong: ({ children }) => <strong>{highlightChildren(children, highlightRegex)}</strong>,
                                em: ({ children }) => <em>{highlightChildren(children, highlightRegex)}</em>,
                            } : undefined}
                        >
                            {currentVersionContent || ''}
                        </ReactMarkdown>
                    )}
                </CardContent>

                {showHistory && (
                    <CardFooter className="flex-col items-start pt-0 pb-3 gap-2 border-t mt-2">
                        <p className="text-xs font-semibold text-muted-foreground mt-2">Version History</p>
                        {initialArtifact.versions.sort((a, b) => b.version_number - a.version_number).map(v => (
                            <div key={v.version_number} className="text-xs text-muted-foreground w-full flex justify-between">
                                <span>v{v.version_number} - {new Date(v.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })} Melbourne time</span>
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

    if (readOnly) return null;

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
