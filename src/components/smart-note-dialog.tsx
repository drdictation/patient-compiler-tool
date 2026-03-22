'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, Mic, Square, Loader2, Check, AlertCircle, FileText, Mail } from 'lucide-react';
import { createSmartNote, SmartNoteOptions } from '@/app/actions';
import { SmartNoteModel } from '@/lib/llm';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface SmartNoteDialogProps {
    patientId: string;
    patientName: string;
    asMobileButton?: boolean;
}

type InputMode = 'paste' | 'record';
type NoteType = 'new_consult' | 'review_consult';
type LetterType = 'new' | 'review';
type TemplateType = 'general' | 'ibd' | 'functional' | 'oesophageal' | 'eoe';
type GenerationStatus = 'idle' | 'generating' | 'success' | 'error';

interface GenerationState {
    transcript: GenerationStatus;
    note: GenerationStatus;
    letter: GenerationStatus;
    tasks: GenerationStatus;
}

export function SmartNoteDialog({ patientId, patientName, asMobileButton = false }: SmartNoteDialogProps) {
    const MAX_CHUNK_MB = 4.5;
    const MAX_TOTAL_MB = 25;

    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    // Input mode
    const [inputMode, setInputMode] = useState<InputMode>('paste');

    // Transcript
    const [transcript, setTranscript] = useState('');

    // Audio recording state (Phase 2)
    const [isRecording, setIsRecording] = useState(false);
    const isRecordingRef = useRef(false);
    const [hasRecording, setHasRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [audioSizeMB, setAudioSizeMB] = useState(0);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcribeProgress, setTranscribeProgress] = useState<{ current: number; total: number } | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioSegmentsRef = useRef<Blob[]>([]);
    const mimeTypeRef = useRef<string>('audio/webm');
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Generation options
    const [noteType, setNoteType] = useState<NoteType>('review_consult');
    const [encounterDate, setEncounterDate] = useState(new Date().toISOString().split('T')[0]);
    const [generateNote, setGenerateNote] = useState(true);
    const [generateLetter, setGenerateLetter] = useState(false);
    const [letterType, setLetterType] = useState<LetterType>('review');
    const [templateType, setTemplateType] = useState<TemplateType>('general');
    const [model, setModel] = useState<SmartNoteModel>('gemini-3-flash-preview');

    // Generation status
    const [generationState, setGenerationState] = useState<GenerationState>({
        transcript: 'idle',
        note: 'idle',
        letter: 'idle',
        tasks: 'idle'
    });

    // Cleanup on unmount only
    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            if (chunkTimerRef.current) {
                clearInterval(chunkTimerRef.current);
                chunkTimerRef.current = null;
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []); // Empty dependency array - only run cleanup on unmount

    const resetState = () => {
        setTranscript('');
        setNoteType('review_consult');
        setEncounterDate(new Date().toISOString().split('T')[0]);
        setGenerateNote(true);
        setGenerateLetter(false);
        setLetterType('review');
        setTemplateType('general');
        setModel('gemini-3-flash-preview');
        setGenerationState({ transcript: 'idle', note: 'idle', letter: 'idle', tasks: 'idle' });
        setRecordingDuration(0);
        setAudioSizeMB(0);
        setIsRecording(false);
        setHasRecording(false);
        setIsTranscribing(false);

        setTranscribeProgress(null);

        audioChunksRef.current = [];
        audioSegmentsRef.current = [];
    };

    // Audio recording functions
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Use Opus codec with lower bitrate for strict Vercel 4.5MB limits
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            mimeTypeRef.current = mimeType;

            audioSegmentsRef.current = [];
            audioChunksRef.current = [];
            setHasRecording(false);
            setAudioSizeMB(0);

            // Track accumulated size for the current segment
            let currentSegmentBytes = 0;
            // 3.5MB threshold — leaves plenty of headroom below Vercel's 4.5MB hard limit
            const SEGMENT_BYTE_LIMIT = 3.5 * 1024 * 1024;
            // Flag to prevent re-entrant segment rotation
            let isRotating = false;

            const finalizeCurrentSegment = () => {
                if (audioChunksRef.current.length > 0) {
                    const blob = new Blob(audioChunksRef.current, { type: mimeType });
                    audioSegmentsRef.current.push(blob);
                    console.log(`[SmartNote] Segment ${audioSegmentsRef.current.length} finalized: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`);

                    // Update total size display
                    const totalBytes = audioSegmentsRef.current.reduce((sum, b) => sum + b.size, 0);
                    setAudioSizeMB(totalBytes / (1024 * 1024));
                    setHasRecording(true);
                }
                audioChunksRef.current = [];
                currentSegmentBytes = 0;
            };

            const rotateRecorder = () => {
                if (isRotating || !isRecordingRef.current) return;
                isRotating = true;

                // Finalize current segment from existing chunks
                finalizeCurrentSegment();

                // Create and start a fresh recorder on the same stream
                if (streamRef.current && isRecordingRef.current) {
                    const newRecorder = new MediaRecorder(streamRef.current, {
                        mimeType,
                        audioBitsPerSecond: 16000,
                    });

                    newRecorder.ondataavailable = handleDataAvailable;
                    newRecorder.onstop = handleStop;
                    newRecorder.onerror = (e) => console.error('[SmartNote] MediaRecorder error:', e);

                    mediaRecorderRef.current = newRecorder;
                    // Use 1-second timeslice so ondataavailable fires frequently even when tab is backgrounded
                    newRecorder.start(1000);
                }
                isRotating = false;
            };

            const handleDataAvailable = (e: BlobEvent) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                    currentSegmentBytes += e.data.size;

                    // If we've accumulated enough data, rotate to a new segment
                    if (currentSegmentBytes >= SEGMENT_BYTE_LIMIT && !isRotating) {
                        // requestData() already fired via timeslice, so we just need to stop and restart
                        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                            mediaRecorderRef.current.stop();
                            // onstop will NOT call finalizeCurrentSegment again — rotateRecorder handles it
                        }
                    }
                }
            };

            const handleStop = () => {
                // Only finalize here if this is the FINAL stop (user clicked stop), not a rotation
                // Rotation stops are handled by rotateRecorder which calls finalizeCurrentSegment first
                if (!isRecordingRef.current) {
                    finalizeCurrentSegment();
                } else if (!isRotating) {
                    // Mid-recording stop triggered by size limit — rotate to new recorder
                    rotateRecorder();
                }
            };

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                audioBitsPerSecond: 16000, // 16 kbps
            });

            mediaRecorder.ondataavailable = handleDataAvailable;
            mediaRecorder.onstop = handleStop;
            mediaRecorder.onerror = (e) => console.error('[SmartNote] MediaRecorder error:', e);

            mediaRecorderRef.current = mediaRecorder;
            // Use 1-second timeslice: ondataavailable fires every ~1s, even when tab is backgrounded
            // This is critical — without timeslice, ondataavailable only fires on stop()
            mediaRecorder.start(1000);

            setIsRecording(true);
            isRecordingRef.current = true;
            setRecordingDuration(0);

            // Visual timer only — chunking is handled by size tracking in ondataavailable
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                setRecordingDuration((prev) => prev + 1);
            }, 1000);

        } catch (error: any) {
            console.error('[SmartNote] Microphone access error:', error);
            toast.error(`Could not access microphone: ${error.message || 'Permission denied'}`);
        }
    };

    const stopRecording = () => {
        setIsRecording(false);
        isRecordingRef.current = false;

        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (chunkTimerRef.current) {
            clearInterval(chunkTimerRef.current);
            chunkTimerRef.current = null;
        }
    };

    const transcribeAudio = async () => {
        if (audioSegmentsRef.current.length === 0) {
            toast.error('No audio recorded');
            return;
        }

        setIsTranscribing(true);
        setTranscribeProgress({ current: 0, total: audioSegmentsRef.current.length });

        try {
            const transcripts: string[] = [];

            // Important: We upload sequentially. Parallel uploads might hit serverless concurrency limits or rate limits
            for (let i = 0; i < audioSegmentsRef.current.length; i++) {
                setTranscribeProgress({ current: i + 1, total: audioSegmentsRef.current.length });

                const segmentBlob = audioSegmentsRef.current[i];
                const sizeMB = segmentBlob.size / (1024 * 1024);

                if (sizeMB > MAX_CHUNK_MB) {
                    throw new Error(`Segment ${i + 1} is unexpectedly too large (${sizeMB.toFixed(1)} MB). Vercel limit is ${MAX_CHUNK_MB} MB.`);
                }

                const formData = new FormData();
                formData.append('file', segmentBlob, `recording-part-${i + 1}.webm`);

                const response = await fetch('/api/transcribe', {
                    method: 'POST',
                    body: formData,
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `Server responded with ${response.status}`);
                }

                if (data.transcript) {
                    transcripts.push(data.transcript.trim());
                } else {
                    throw new Error('No transcript returned from server for segment');
                }
            }

            if (transcripts.length > 0) {
                setTranscript((prev) => {
                    const existing = prev ? prev.trim() + '\n\n' : '';
                    return existing + transcripts.filter(Boolean).join('\n\n');
                });
                toast.success('Audio transcribed successfully');
            }

        } catch (error: any) {
            console.error('[SmartNote] Transcription error:', error);
            const message = error?.message || 'Unknown error';
            toast.error(`Failed to transcribe: ${message}`);
        } finally {
            setIsTranscribing(false);
            setTranscribeProgress(null);
        }
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleGenerate = () => {
        if (!transcript.trim()) {
            toast.error('Please enter or record a transcript');
            return;
        }

        if (!generateNote && !generateLetter) {
            toast.error('Please select at least one output type');
            return;
        }

        setGenerationState({
            transcript: 'generating',
            note: generateNote ? 'generating' : 'idle',
            letter: generateLetter ? 'generating' : 'idle',
            tasks: 'generating'
        });

        startTransition(async () => {
            try {
                const options: SmartNoteOptions = {
                    patientId,
                    patientName,
                    date: encounterDate,
                    transcript: transcript.trim(),
                    noteType,
                    outputs: {
                        generateNote,
                        generateLetter,
                        letterType: generateLetter ? letterType : undefined,
                        templateType: generateLetter ? templateType : undefined
                    },
                    model
                };

                const result = await createSmartNote(options);

                // Update generation states based on results
                setGenerationState({
                    transcript: result.transcriptArtifactId ? 'success' : 'error',
                    note: generateNote
                        ? (result.noteArtifactId ? 'success' : 'error')
                        : 'idle',
                    letter: generateLetter
                        ? (result.letterArtifactId ? 'success' : 'error')
                        : 'idle',
                    tasks: result.tasksExtracted !== undefined ? 'success' : 'error'
                });

                if (result.errors.length > 0) {
                    result.errors.forEach(err => toast.error(err));
                }

                const successCount = [
                    result.transcriptArtifactId,
                    result.noteArtifactId,
                    result.letterArtifactId
                ].filter(Boolean).length;

                if (successCount > 0) {
                    const taskMsg = result.tasksExtracted ? ` + ${result.tasksExtracted} task(s)` : '';
                    toast.success(`Created ${successCount} artifact(s)${taskMsg} successfully`);
                    setTimeout(() => {
                        setOpen(false);
                        resetState();
                        router.refresh();
                    }, 1500);
                }

            } catch (e: any) {
                toast.error(`Failed: ${e.message}`);
                setGenerationState({
                    transcript: 'error',
                    note: generateNote ? 'error' : 'idle',
                    letter: generateLetter ? 'error' : 'idle',
                    tasks: 'error'
                });
            }
        });
    };

    const StatusIndicator = ({ status, label }: { status: GenerationStatus; label: string }) => {
        if (status === 'idle') return null;

        return (
            <div className="flex items-center gap-2 text-sm">
                {status === 'generating' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                {status === 'success' && <Check className="h-4 w-4 text-green-500" />}
                {status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                <span className={
                    status === 'generating' ? 'text-blue-600' :
                        status === 'success' ? 'text-green-600' :
                            'text-red-600'
                }>
                    {label}
                    {status === 'generating' && '...'}
                </span>
            </div>
        );
    };

    const triggerButton = asMobileButton ? (
        <Button variant="ghost" size="sm" className="flex-col h-auto py-2 px-3 gap-1">
            <Sparkles className="h-5 w-5" />
            <span className="text-[10px]">Smart Note</span>
        </Button>
    ) : (
        <Button size="sm" variant="outline" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Smart Note
        </Button>
    );

    return (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetState(); }}>
            <DialogTrigger asChild>
                {triggerButton}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-amber-500" />
                        Smart Note
                    </DialogTitle>
                    <DialogDescription>
                        Generate structured notes and letters from a transcript using AI.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-1 py-2 space-y-6">
                    {/* Mode Toggle */}
                    <div className="flex gap-2">
                        <Button
                            variant={inputMode === 'paste' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setInputMode('paste')}
                        >
                            <FileText className="h-4 w-4 mr-2" />
                            Paste Transcript
                        </Button>
                        <Button
                            variant={inputMode === 'record' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setInputMode('record')}
                        >
                            <Mic className="h-4 w-4 mr-2" />
                            Record Audio
                        </Button>
                    </div>

                    {/* Quick Smart Note Controls */}
                    <div className="rounded-lg border p-4 bg-gray-50 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Consult Type</Label>
                                <RadioGroup
                                    value={noteType}
                                    onValueChange={(v) => {
                                        const next = v as NoteType;
                                        setNoteType(next);
                                        if (next === 'new_consult') {
                                            setLetterType('new');
                                            setTemplateType('general');
                                        } else {
                                            setLetterType('review');
                                            if (templateType === 'eoe' || templateType === 'oesophageal') {
                                                setTemplateType('general');
                                            }
                                        }
                                    }}
                                    className="flex gap-6"
                                >
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="new_consult" id="new_consult" />
                                        <Label htmlFor="new_consult" className="font-normal cursor-pointer">
                                            New Consult
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="review_consult" id="review_consult" />
                                        <Label htmlFor="review_consult" className="font-normal cursor-pointer">
                                            Review Consult
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            <div className="space-y-2">
                                <Label>Generate</Label>
                                <div className="flex flex-wrap items-center gap-6 pt-1">
                                    <div className="flex items-center space-x-3">
                                        <Checkbox
                                            id="generateNote"
                                            checked={generateNote}
                                            onCheckedChange={(c) => setGenerateNote(!!c)}
                                        />
                                        <Label htmlFor="generateNote" className="flex items-center gap-2 font-normal cursor-pointer">
                                            <FileText className="h-4 w-4" />
                                            Consult Note
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <Checkbox
                                            id="generateLetter"
                                            checked={generateLetter}
                                            onCheckedChange={(c) => setGenerateLetter(!!c)}
                                        />
                                        <Label htmlFor="generateLetter" className="flex items-center gap-2 font-normal cursor-pointer">
                                            <Mail className="h-4 w-4" />
                                            Letter
                                        </Label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Model</Label>
                                <Select value={model} onValueChange={(v) => setModel(v as SmartNoteModel)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="gemini-3-flash-preview">Gemini 3 Flash (Preview)</SelectItem>
                                        <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                                        <SelectItem value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash-Lite</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Letter Style</Label>
                                <Select
                                    value={letterType}
                                    onValueChange={(v) => {
                                        const next = v as LetterType;
                                        setLetterType(next);
                                        if (next === 'new') {
                                            setTemplateType('general');
                                        } else if (templateType === 'eoe' || templateType === 'oesophageal') {
                                            setTemplateType('general');
                                        }
                                    }}
                                    disabled={!generateLetter}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="new">New Letter</SelectItem>
                                        <SelectItem value="review">Review Letter</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Template</Label>
                                <Select
                                    value={templateType}
                                    onValueChange={(v) => setTemplateType(v as TemplateType)}
                                    disabled={!generateLetter}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Template" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="general">General</SelectItem>
                                        <SelectItem value="ibd">IBD</SelectItem>
                                        <SelectItem value="functional">Functional GI</SelectItem>
                                        {letterType === 'new' && (
                                            <>
                                                <SelectItem value="oesophageal">Oesophageal</SelectItem>
                                                <SelectItem value="eoe">EoE</SelectItem>
                                            </>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Input Section */}
                    {inputMode === 'paste' ? (
                        <div className="space-y-2">
                            <Label htmlFor="transcript">Transcript</Label>
                            <Textarea
                                id="transcript"
                                value={transcript}
                                onChange={(e) => setTranscript(e.target.value)}
                                placeholder="Paste your consultation transcript here..."
                                className="min-h-[200px] resize-y"
                            />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Label>Audio Recording</Label>
                            <div className="border rounded-lg p-4 bg-gray-50 space-y-4">
                                {!isRecording && !hasRecording && (
                                    <div className="text-center">
                                        <Button onClick={startRecording} size="lg" className="gap-2">
                                            <Mic className="h-5 w-5" />
                                            Start Recording
                                        </Button>
                                    </div>
                                )}

                                {isRecording && (
                                    <div className="text-center space-y-3">
                                        <div className="flex items-center justify-center gap-3">
                                            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                            <span className="text-lg font-mono">{formatDuration(recordingDuration)}</span>
                                        </div>
                                        <Button onClick={stopRecording} variant="destructive" size="lg" className="gap-2">
                                            <Square className="h-5 w-5" />
                                            Stop Recording
                                        </Button>
                                    </div>
                                )}

                                {!isRecording && hasRecording && (
                                    <div className="text-center space-y-3">
                                        <p className="text-sm text-muted-foreground">
                                            Recording complete ({formatDuration(recordingDuration)}) —{' '}
                                            <span className={audioSizeMB > MAX_TOTAL_MB ? 'text-red-500 font-medium' : ''}>
                                                {audioSizeMB.toFixed(2)} MB
                                            </span>
                                        </p>
                                        {audioSizeMB > MAX_TOTAL_MB && (
                                            <p className="text-xs text-red-500">
                                                ⚠️ File limit reached ({MAX_TOTAL_MB} MB max).
                                            </p>
                                        )}
                                        <div className="flex justify-center gap-2">
                                            <Button onClick={startRecording} variant="outline" className="gap-2">
                                                <Mic className="h-4 w-4" />
                                                Re-record
                                            </Button>
                                            <Button
                                                onClick={transcribeAudio}
                                                disabled={isTranscribing || audioSizeMB > MAX_TOTAL_MB}
                                                className="gap-2"
                                            >
                                                {isTranscribing && <Loader2 className="h-4 w-4 animate-spin" />}
                                                {isTranscribing ? 'Transcribing...' : 'Transcribe'}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {isTranscribing && transcribeProgress && (
                                    <p className="text-xs text-muted-foreground text-center animate-pulse">
                                        Transcribing segment {transcribeProgress.current} of {transcribeProgress.total}...
                                    </p>
                                )}
                            </div>

                            {transcript && (
                                <div className="space-y-2">
                                    <Label>Transcribed Text</Label>
                                    <Textarea
                                        value={transcript}
                                        onChange={(e) => setTranscript(e.target.value)}
                                        className="min-h-[150px] resize-y"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Date */}
                    <div className="space-y-2">
                        <Label htmlFor="encounter-date">Encounter Date</Label>
                        <Input
                            id="encounter-date"
                            type="date"
                            value={encounterDate}
                            onChange={(e) => setEncounterDate(e.target.value)}
                            className="w-full"
                        />
                    </div>

                    {/* Generation Status */}
                    {(generationState.transcript !== 'idle' ||
                        generationState.note !== 'idle' ||
                        generationState.letter !== 'idle' ||
                        generationState.tasks !== 'idle') && (
                            <div className="border rounded-lg p-4 bg-gray-50 space-y-2">
                                <Label className="text-sm font-medium">Generation Progress</Label>
                                <StatusIndicator status={generationState.transcript} label="Saving transcript" />
                                <StatusIndicator status={generationState.note} label="Generating note" />
                                <StatusIndicator status={generationState.letter} label="Generating letter" />
                                <StatusIndicator status={generationState.tasks} label="Extracting tasks" />
                            </div>
                        )}
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleGenerate} disabled={isPending || !transcript.trim()}>
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {isPending ? 'Generating...' : 'Generate Smart Note'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
