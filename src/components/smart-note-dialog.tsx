'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Switch } from "@/components/ui/switch";
import { Sparkles, Mic, Square, Loader2, Check, AlertCircle, FileText, Mail } from 'lucide-react';
import { prepareSmartNoteGeneration, generateClinicalDocuments, extractAndSaveTasks, SmartNoteOptions } from '@/app/actions';
import { CONSULT_NOTE_MODEL } from '@/lib/llm';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface SmartNoteDialogProps {
    patientId: string;
    patientName: string;
    asMobileButton?: boolean;
    mode?: 'standard' | 'quick-record';
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

export function SmartNoteDialog({ patientId, patientName, asMobileButton = false, mode = 'standard' }: SmartNoteDialogProps) {
    const MAX_CHUNK_MB = 4.5;
    const MAX_TOTAL_MB = 25;

    const [open, setOpen] = useState(false);
    const [, startTransition] = useTransition();
    const [isPreparing, setIsPreparing] = useState(false);
    const [isGeneratingClinical, setIsGeneratingClinical] = useState(false);
    const [, setIsExtractingTasks] = useState(false);
    const isMountedRef = useRef(true);
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
    const generateNote = true;
    const generateLetter = true;
    const [letterType, setLetterType] = useState<LetterType>('review');
    const [templateType, setTemplateType] = useState<TemplateType>('general');
    const model = CONSULT_NOTE_MODEL;
    const [isComplex, setIsComplex] = useState(false);
    const [pronouns, setPronouns] = useState<'auto' | 'he_him' | 'she_her' | 'they_them'>('auto');
    const [extractTasksRequested, setExtractTasksRequested] = useState(false);

    // Generation status
    const [generationState, setGenerationState] = useState<GenerationState>({
        transcript: 'idle',
        note: 'idle',
        letter: 'idle',
        tasks: 'idle'
    });

    // Cleanup on unmount only
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
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
                    // Automatically trigger transcription and note generation
                    transcribeAudioRef.current();
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

    const resetState = () => {
        stopRecording(); // Release audio resources cleanly

        setTranscript('');
        setNoteType('review_consult');
        setEncounterDate(new Date().toISOString().split('T')[0]);
        setLetterType('review');
        setTemplateType('general');
        setIsComplex(false);
        setPronouns('auto');
        setExtractTasksRequested(false);
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

    // Auto-start recording for Quick Record mode
    useEffect(() => {
        if (open && mode === 'quick-record') {
            setInputMode('record');
            setNoteType('review_consult');
            setLetterType('review');
            const timer = setTimeout(() => {
                startRecording();
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [open, mode]);

    const runSmartNoteGeneration = (transcriptText: string) => {
        setGenerationState({
            transcript: 'generating',
            note: generateNote ? 'generating' : 'idle',
            letter: generateLetter ? 'generating' : 'idle',
            tasks: extractTasksRequested ? 'generating' : 'idle'
        });

        setIsPreparing(true);

        startTransition(async () => {
            let context;
            try {
                const options: SmartNoteOptions = {
                    patientId,
                    patientName,
                    date: encounterDate,
                    transcript: transcriptText,
                    noteType,
                    outputs: {
                        generateNote,
                        generateLetter,
                        letterType: generateLetter ? letterType : undefined,
                        templateType: generateLetter ? templateType : undefined,
                        isComplex: generateLetter ? isComplex : undefined,
                        pronouns: generateLetter ? pronouns : undefined
                    },
                    extractTasks: extractTasksRequested,
                    model
                };

                context = await prepareSmartNoteGeneration(options);
                
                if (isMountedRef.current) {
                    setGenerationState(prev => ({
                        ...prev,
                        transcript: 'success'
                    }));
                    setIsPreparing(false);
                    setIsGeneratingClinical(true);
                    setIsExtractingTasks(extractTasksRequested);
                }
            } catch (e: any) {
                console.error('Preparation failed:', e);
                if (isMountedRef.current) {
                    setIsPreparing(false);
                    toast.error(`Preparation failed: ${e.message}`);
                    setGenerationState({
                        transcript: 'error',
                        note: generateNote ? 'error' : 'idle',
                        letter: generateLetter ? 'error' : 'idle',
                        tasks: 'error'
                    });
                }
                return;
            }

            // Task extraction is an optional, separate LLM request.
            const clinicalPromise = generateClinicalDocuments(context);
            if (extractTasksRequested) {
                extractAndSaveTasks(context)
                    .then((result) => {
                        if (isMountedRef.current && open) {
                            setGenerationState(prev => ({
                                ...prev,
                                tasks: result.status === 'success' ? 'success' : 'error'
                            }));
                            setIsExtractingTasks(false);
                        }
                        if (result.status === 'success') {
                            toast.success(`Extracted and saved ${result.insertedCount} tasks successfully`);
                        } else if (result.status === 'failed' && result.error) {
                            toast.error(`Task extraction warning: ${result.error.message}`);
                        }
                    })
                    .catch((err) => {
                        console.error('Task promise error:', err);
                        if (isMountedRef.current && open) {
                            setGenerationState(prev => ({
                                ...prev,
                                tasks: 'error'
                            }));
                            setIsExtractingTasks(false);
                        }
                        toast.error(`Task extraction failed: ${err.message || 'Unknown error'}`);
                    });
            }

            // Await only the clinical document promise
            try {
                const clinicalResult = await clinicalPromise;

                if (isMountedRef.current) {
                    setIsGeneratingClinical(false);

                    setGenerationState(prev => ({
                        ...prev,
                        note: clinicalResult.note ? (clinicalResult.note.status === 'success' ? 'success' : 'error') : 'idle',
                        letter: clinicalResult.letter ? (clinicalResult.letter.status === 'success' ? 'success' : 'error') : 'idle'
                    }));
                }

                // Gather errors and success counts
                const errors: string[] = [];
                const successArtifacts: string[] = [];

                if (clinicalResult.note) {
                    if (clinicalResult.note.status === 'success') {
                        successArtifacts.push('Consult note');
                    } else if (clinicalResult.note.error) {
                        errors.push(`Note generation failed: ${clinicalResult.note.error.message}`);
                    }
                }

                if (clinicalResult.letter) {
                    if (clinicalResult.letter.status === 'success') {
                        successArtifacts.push('Referrer letter');
                    } else if (clinicalResult.letter.error) {
                        errors.push(`Letter generation failed: ${clinicalResult.letter.error.message}`);
                    }
                }

                if (errors.length > 0) {
                    errors.forEach(err => toast.error(err));
                }

                if (clinicalResult.letter?.warnings && clinicalResult.letter.warnings.length > 0) {
                    console.warn('Letter validation warnings accepted automatically:', clinicalResult.letter.warnings);
                }

                if (successArtifacts.length > 0) {
                    toast.success(`Created ${successArtifacts.join(' and ')} successfully`);
                    
                    // Do not block dialog close or router refresh for validation warnings
                    // or the separately-running optional task request.
                    setTimeout(() => {
                        if (isMountedRef.current) {
                            setOpen(false);
                            resetState();
                        }
                        router.refresh();
                    }, 1500);
                }
            } catch (e: any) {
                console.error('Clinical generation failed:', e);
                if (isMountedRef.current) {
                    setIsGeneratingClinical(false);
                    setGenerationState(prev => ({
                        ...prev,
                        note: generateNote ? 'error' : 'idle',
                        letter: generateLetter ? 'error' : 'idle'
                    }));
                    toast.error(`Clinical generation failed: ${e.message}`);
                }
            }
        });
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

            if (transcripts.length === 0) {
                throw new Error('No transcript returned from audio');
            }

            const appendedTranscript = transcripts.filter(Boolean).join('\n\n').trim();
            const combinedTranscript = [transcript.trim(), appendedTranscript].filter(Boolean).join('\n\n');

            setTranscript(combinedTranscript);
            toast.success('Audio transcribed. Generating note and letter...');
            runSmartNoteGeneration(combinedTranscript);
        } catch (error: any) {
            console.error('[SmartNote] Transcription error:', error);
            const message = error?.message || 'Unknown error';
            toast.error(`Failed to transcribe: ${message}`);
        } finally {
            setIsTranscribing(false);
            setTranscribeProgress(null);
        }
    };

    const transcribeAudioRef = useRef(transcribeAudio);
    useEffect(() => {
        transcribeAudioRef.current = transcribeAudio;
    });

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

        runSmartNoteGeneration(transcript.trim());
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

    const triggerButton = mode === 'quick-record' ? (
        asMobileButton ? (
            <Button variant="ghost" size="sm" className="flex-col h-auto py-2 px-3 gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50/50">
                <div className="relative">
                    <Mic className="h-5 w-5 text-red-500" />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-ping" />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
                </div>
                <span className="text-[10px] font-semibold text-rose-700">Quick Record</span>
            </Button>
        ) : (
            <Button 
                size="sm" 
                variant="default" 
                className="gap-2 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-medium shadow-sm transition-all duration-300 hover:shadow-md border-0 group relative overflow-hidden active:scale-95"
            >
                <div className="relative flex items-center justify-center">
                    <Mic className="h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-white rounded-full" />
                </div>
                <span>Quick Record Review</span>
            </Button>
        )
    ) : (
        asMobileButton ? (
            <Button variant="ghost" size="sm" className="flex-col h-auto py-2 px-3 gap-1">
                <Sparkles className="h-5 w-5" />
                <span className="text-[10px]">Smart Note</span>
            </Button>
        ) : (
            <Button size="sm" variant="outline" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Smart Note
            </Button>
        )
    );

    return (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetState(); }}>
            <DialogTrigger asChild>
                {triggerButton}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 justify-between">
                        <div className="flex items-center gap-2">
                            {mode === 'quick-record' ? (
                                <>
                                    <div className="relative p-1 bg-red-50 rounded-lg text-red-600">
                                        <Mic className="h-5 w-5 animate-pulse" />
                                    </div>
                                    <span className="font-semibold text-slate-800">Quick Record: Review Consult</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />
                                    <span className="font-semibold text-slate-800">Smart Note</span>
                                </>
                            )}
                        </div>
                        {mode === 'quick-record' && isRecording && (
                            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 animate-pulse border border-red-200">
                                <span className="w-1.5 h-1.5 bg-red-600 rounded-full" />
                                Live Recording
                            </span>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'quick-record'
                            ? `Recording a review consultation for ${patientName}. The audio will be automatically transcribed and analyzed.`
                            : "Generate structured notes and letters from a transcript using AI."
                        }
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
                                <Label>Outputs</Label>
                                <div className="flex flex-wrap items-center gap-6 pt-1 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4" />
                                        <span>Consult note</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-4 w-4" />
                                        <span>Letter</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-2">
                                <Label>AI models</Label>
                                <div className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                                    Notes: Gemini 3.1 Flash-Lite<br />Letters: GPT-5.6 Luna
                                </div>
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

                            <div className="space-y-2">
                                <Label>Pronouns</Label>
                                <Select
                                    value={pronouns}
                                    onValueChange={(v) => setPronouns(v as any)}
                                    disabled={!generateLetter}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Pronouns" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="auto">Auto (Default)</SelectItem>
                                        <SelectItem value="he_him">He/Him</SelectItem>
                                        <SelectItem value="she_her">She/Her</SelectItem>
                                        <SelectItem value="they_them">They/Them</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex items-center justify-between border-t pt-3 mt-3">
                            <div className="space-y-0.5">
                                <Label htmlFor="complex-letter" className="font-semibold text-slate-700">Detailed letter (transcript-supported)</Label>
                                <p className="text-[10px] text-slate-500">Produces a more comprehensive letter covering all transcript-supported clinical details</p>
                            </div>
                            <Switch
                                id="complex-letter"
                                checked={isComplex}
                                onCheckedChange={setIsComplex}
                                disabled={!generateLetter}
                            />
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
                                                {isTranscribing ? 'Transcribing...' : 'Transcribe & Generate'}
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
                    <>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={isPreparing || isGeneratingClinical}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant={extractTasksRequested ? 'secondary' : 'outline'}
                            onClick={() => setExtractTasksRequested((requested) => !requested)}
                            disabled={isPreparing || isGeneratingClinical}
                        >
                            {extractTasksRequested ? 'Task extraction included' : 'Include task extraction'}
                        </Button>
                        <Button onClick={handleGenerate} disabled={isPreparing || isGeneratingClinical || !transcript.trim()}>
                            {(isPreparing || isGeneratingClinical) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {isPreparing ? 'Preparing...' : isGeneratingClinical ? 'Generating Documents...' : 'Generate Smart Note'}
                        </Button>
                    </>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
