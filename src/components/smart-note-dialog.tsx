'use client';

import { useState, useTransition, useRef, useEffect, useCallback, useMemo } from 'react';
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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
    Sparkles,
    Mic,
    Square,
    Loader2,
    Check,
    AlertCircle,
    AlertTriangle,
    FileText,
    Mail,
    UserCheck,
    PenLine,
    Copy,
    SlidersHorizontal,
    Stethoscope,
    MessageSquareText,
} from 'lucide-react';
import { prepareSmartNoteGeneration, generateClinicalDocuments, extractAndSaveTasks, SmartNoteOptions } from '@/app/actions';
import { CONSULT_NOTE_MODEL, CONSULT_LETTER_MODEL } from '@/lib/model-config';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { getMelbourneDate } from '@/lib/date-time';
import ReactMarkdown from 'react-markdown';
import { requestScreenWakeLock, releaseScreenWakeLock } from '@/lib/audio/wake-lock';
import { PatientQaWidget } from '@/components/patient-qa-widget';
import { ClinicalSnapshotCard } from '@/components/clinical-snapshot-card';
import { ClinicalSnapshot } from '@/lib/clinical-snapshot';
import { copyMarkdownAsRichHtml } from '@/lib/clipboard';
import { scanLetterRiskPhrases, hasLetterRiskPhrases } from '@/lib/generation/letter-risk-phrases';

interface SmartNoteDialogProps {
    patientId: string;
    patientName: string;
    asMobileButton?: boolean;
    mode?: 'standard' | 'quick-record';
    priorNotes?: Array<{ id: string; encounterDate: string; label: string; content: string }>;
    initialSnapshot?: ClinicalSnapshot | null;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onGenerated?: (patientId: string, artifacts: { note?: string; letter?: string; summary?: string }) => void;
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
    patientSummary: GenerationStatus;
    tasks: GenerationStatus;
}

export function SmartNoteDialog({
    patientId,
    patientName,
    asMobileButton = false,
    mode = 'standard',
    priorNotes = [],
    initialSnapshot = null,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    onGenerated
}: SmartNoteDialogProps) {
    const MAX_CHUNK_MB = 4.5;
    const MAX_TOTAL_MB = 25;

    const isControlled = controlledOpen !== undefined;
    const [internalOpen, setInternalOpen] = useState(false);
    const open = isControlled ? controlledOpen : internalOpen;

    const setOpen = useCallback((newOpen: boolean) => {
        if (!isControlled) {
            setInternalOpen(newOpen);
        }
        controlledOnOpenChange?.(newOpen);
    }, [isControlled, controlledOnOpenChange]);
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

    // Audio recording state
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
    const [encounterDate, setEncounterDate] = useState(getMelbourneDate);
    const [typedNotes, setTypedNotes] = useState('');
    const [generateNote, setGenerateNote] = useState(true);
    const [generateLetter, setGenerateLetter] = useState(true);
    const [generatePatientSummary, setGeneratePatientSummary] = useState(false);
    const [letterType, setLetterType] = useState<LetterType>('review');
    const [templateType, setTemplateType] = useState<TemplateType>('general');
    const model = CONSULT_NOTE_MODEL;
    const [isComplex, setIsComplex] = useState(false);
    const [pronouns, setPronouns] = useState<'auto' | 'he_him' | 'she_her' | 'they_them'>('auto');
    const [extractTasksRequested, setExtractTasksRequested] = useState(false);

    // Generation status & warnings
    const [generationState, setGenerationState] = useState<GenerationState>({
        transcript: 'idle',
        note: 'idle',
        letter: 'idle',
        patientSummary: 'idle',
        tasks: 'idle'
    });
    const [generatedDocs, setGeneratedDocs] = useState<{ note?: string; letter?: string; patientSummary?: string }>({});
    const [letterWarnings, setLetterWarnings] = useState<string[]>([]);
    const [copiedDoc, setCopiedDoc] = useState<'note' | 'letter' | 'patientSummary' | null>(null);

    const letterRiskMatches = useMemo(
        () => scanLetterRiskPhrases(generatedDocs.letter),
        [generatedDocs.letter]
    );

    const handleCopyGenerated = async (docType: 'note' | 'letter' | 'patientSummary', content?: string) => {
        if (!content) return;
        try {
            const copyMode = await copyMarkdownAsRichHtml(content);
            setCopiedDoc(docType);
            const label = docType === 'note' ? 'Note' : docType === 'letter' ? 'Letter' : 'Summary';
            toast.success(`${label} copied${copyMode === 'rich' ? ' with formatting' : ''}`);
            setTimeout(() => setCopiedDoc(prev => (prev === docType ? null : prev)), 2000);
        } catch {
            toast.error('Failed to copy');
        }
    };

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
            releaseScreenWakeLock();
        };
    }, []);

    // Audio recording functions
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            await requestScreenWakeLock();

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            mimeTypeRef.current = mimeType;

            audioSegmentsRef.current = [];
            audioChunksRef.current = [];
            setHasRecording(false);
            setAudioSizeMB(0);

            let currentSegmentBytes = 0;
            const SEGMENT_BYTE_LIMIT = 3.5 * 1024 * 1024;
            let isRotating = false;

            const finalizeCurrentSegment = () => {
                if (audioChunksRef.current.length > 0) {
                    const blob = new Blob(audioChunksRef.current, { type: mimeType });
                    audioSegmentsRef.current.push(blob);
                    console.log(`[SmartNote] Segment ${audioSegmentsRef.current.length} finalized: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`);

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

                finalizeCurrentSegment();

                if (streamRef.current && isRecordingRef.current) {
                    const newRecorder = new MediaRecorder(streamRef.current, {
                        mimeType,
                        audioBitsPerSecond: 16000,
                    });

                    newRecorder.ondataavailable = handleDataAvailable;
                    newRecorder.onstop = handleStop;
                    newRecorder.onerror = (e) => console.error('[SmartNote] MediaRecorder error:', e);

                    mediaRecorderRef.current = newRecorder;
                    newRecorder.start(1000);
                }
                isRotating = false;
            };

            const handleDataAvailable = (e: BlobEvent) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                    currentSegmentBytes += e.data.size;

                    if (currentSegmentBytes >= SEGMENT_BYTE_LIMIT && !isRotating) {
                        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                            mediaRecorderRef.current.stop();
                        }
                    }
                }
            };

            const handleStop = () => {
                if (!isRecordingRef.current) {
                    finalizeCurrentSegment();
                    transcribeAudioRef.current();
                } else if (!isRotating) {
                    rotateRecorder();
                }
            };

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                audioBitsPerSecond: 16000,
            });

            mediaRecorder.ondataavailable = handleDataAvailable;
            mediaRecorder.onstop = handleStop;
            mediaRecorder.onerror = (e) => console.error('[SmartNote] MediaRecorder error:', e);

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start(1000);

            setIsRecording(true);
            isRecordingRef.current = true;
            setRecordingDuration(0);

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
        stopRecording();
        releaseScreenWakeLock();

        setTranscript('');
        setTypedNotes('');
        setNoteType('review_consult');
        setEncounterDate(getMelbourneDate());
        setLetterType('review');
        setTemplateType('general');
        setIsComplex(false);
        setPronouns('auto');
        setExtractTasksRequested(false);
        setGenerateNote(true);
        setGenerateLetter(true);
        setGeneratePatientSummary(false);
        setGenerationState({ transcript: 'idle', note: 'idle', letter: 'idle', patientSummary: 'idle', tasks: 'idle' });
        setGeneratedDocs({});
        setLetterWarnings([]);
        setCopiedDoc(null);
        setRecordingDuration(0);
        setAudioSizeMB(0);
        setIsRecording(false);
        setHasRecording(false);
        setIsTranscribing(false);
        setTranscribeProgress(null);

        audioChunksRef.current = [];
        audioSegmentsRef.current = [];
    };

    const handleOpenChange = useCallback((newOpen: boolean) => {
        setOpen(newOpen);
        if (!newOpen) {
            resetState();
        }
    }, [setOpen]);

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
    }, [open, mode, patientId]);

    const runSmartNoteGeneration = (transcriptText: string) => {
        setGenerationState({
            transcript: 'generating',
            note: generateNote ? 'generating' : 'idle',
            letter: generateLetter ? 'generating' : 'idle',
            patientSummary: generatePatientSummary ? 'generating' : 'idle',
            tasks: extractTasksRequested ? 'generating' : 'idle'
        });
        setLetterWarnings([]);
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
                        generatePatientSummary,
                        letterType: generateLetter ? letterType : undefined,
                        templateType: generateLetter ? templateType : undefined,
                        isComplex: generateLetter ? isComplex : undefined,
                        pronouns: generateLetter ? pronouns : undefined
                    },
                    extractTasks: extractTasksRequested,
                    model,
                    typedNotes: typedNotes.trim() || undefined
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
                        patientSummary: generatePatientSummary ? 'error' : 'idle',
                        tasks: 'error'
                    });
                }
                return;
            }

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

            setGeneratedDocs({});
            const docPromises: Array<Promise<void>> = [];
            const errors: string[] = [];
            const successArtifacts: string[] = [];
            const collected: { note?: string; letter?: string; summary?: string } = {};
            const collectedWarnings: string[] = [];
            const failedFlags = { note: false, letter: false, patientSummary: false };

            if (generateNote) {
                const noteCtx = {
                    ...context,
                    outputs: { ...context.outputs, generateNote: true, generateLetter: false, generatePatientSummary: false }
                };
                docPromises.push(
                    generateClinicalDocuments(noteCtx).then((res) => {
                        if (res.note?.status === 'success') {
                            successArtifacts.push('Consult note');
                            collected.note = res.note.content;
                            if (isMountedRef.current) {
                                setGeneratedDocs(prev => ({ ...prev, note: res.note?.content }));
                                setGenerationState(prev => ({ ...prev, note: 'success' }));
                            }
                        } else {
                            failedFlags.note = true;
                            if (res.note?.error) errors.push(`Note generation failed: ${res.note.error.message}`);
                            if (isMountedRef.current) setGenerationState(prev => ({ ...prev, note: 'error' }));
                        }
                    }).catch((err: any) => {
                        failedFlags.note = true;
                        errors.push(`Note generation failed: ${err?.message || 'Unknown error'}`);
                        if (isMountedRef.current) setGenerationState(prev => ({ ...prev, note: 'error' }));
                    })
                );
            }

            if (generateLetter) {
                const letterCtx = {
                    ...context,
                    outputs: { ...context.outputs, generateNote: false, generateLetter: true, generatePatientSummary: false }
                };
                docPromises.push(
                    generateClinicalDocuments(letterCtx).then((res) => {
                        if (res.letter?.status === 'success') {
                            successArtifacts.push('Referrer letter');
                            collected.letter = res.letter.content;
                            if (res.letter.warnings?.length) {
                                collectedWarnings.push(...res.letter.warnings);
                                if (isMountedRef.current) {
                                    setLetterWarnings(res.letter.warnings);
                                }
                            }
                            if (isMountedRef.current) {
                                setGeneratedDocs(prev => ({ ...prev, letter: res.letter?.content }));
                                setGenerationState(prev => ({ ...prev, letter: 'success' }));
                            }
                        } else {
                            failedFlags.letter = true;
                            if (res.letter?.error) errors.push(`Letter generation failed: ${res.letter.error.message}`);
                            if (isMountedRef.current) setGenerationState(prev => ({ ...prev, letter: 'error' }));
                        }
                    }).catch((err: any) => {
                        failedFlags.letter = true;
                        errors.push(`Letter generation failed: ${err?.message || 'Unknown error'}`);
                        if (isMountedRef.current) setGenerationState(prev => ({ ...prev, letter: 'error' }));
                    })
                );
            }

            if (generatePatientSummary) {
                const summaryCtx = {
                    ...context,
                    outputs: { ...context.outputs, generateNote: false, generateLetter: false, generatePatientSummary: true }
                };
                docPromises.push(
                    generateClinicalDocuments(summaryCtx).then((res) => {
                        if (res.patientSummary?.status === 'success') {
                            successArtifacts.push('Patient summary');
                            collected.summary = res.patientSummary.content;
                            if (isMountedRef.current) {
                                setGeneratedDocs(prev => ({ ...prev, patientSummary: res.patientSummary?.content }));
                                setGenerationState(prev => ({ ...prev, patientSummary: 'success' }));
                            }
                        } else {
                            failedFlags.patientSummary = true;
                            if (res.patientSummary?.error) errors.push(`Patient summary generation failed: ${res.patientSummary.error.message}`);
                            if (isMountedRef.current) setGenerationState(prev => ({ ...prev, patientSummary: 'error' }));
                        }
                    }).catch((err: any) => {
                        failedFlags.patientSummary = true;
                        errors.push(`Patient summary generation failed: ${err?.message || 'Unknown error'}`);
                        if (isMountedRef.current) setGenerationState(prev => ({ ...prev, patientSummary: 'error' }));
                    })
                );
            }

            try {
                await Promise.all(docPromises);

                if (isMountedRef.current) {
                    setIsGeneratingClinical(false);
                }

                if (errors.length > 0) {
                    errors.forEach(err => toast.error(err));
                }

                if (errors.length > 0 && isMountedRef.current) {
                    setGenerateNote(failedFlags.note);
                    setGenerateLetter(failedFlags.letter);
                    setGeneratePatientSummary(failedFlags.patientSummary);
                    setExtractTasksRequested(false);
                    toast.info('Failed documents are selected for retry. Successful documents will not be regenerated.');
                }

                if (successArtifacts.length > 0) {
                    const hasRisk = hasLetterRiskPhrases(collected.letter);
                    const hasWarnings = collectedWarnings.length > 0 || hasRisk;

                    if (hasWarnings) {
                        toast.warning('Letter generated with review warnings — check flagged phrases before copying');
                    } else {
                        toast.success(`Created ${successArtifacts.join(' and ')} successfully`);
                    }

                    if (onGenerated) {
                        onGenerated(patientId, collected);
                    }

                    // Skip 1.5s auto-close when there are errors, validation warnings, or risky phrases
                    if (errors.length === 0 && !hasWarnings) {
                        setTimeout(() => {
                            if (isMountedRef.current) {
                                handleOpenChange(false);
                            }
                            router.refresh();
                        }, 1500);
                    } else {
                        router.refresh();
                    }
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
                releaseScreenWakeLock();
            }
        });
    };

    const transcribeAudio = async () => {
        if (!generateNote && !generateLetter && !generatePatientSummary) {
            toast.error('Select at least one document to generate');
            return;
        }
        if (audioSegmentsRef.current.length === 0) {
            toast.error('No audio recorded');
            return;
        }

        setIsTranscribing(true);
        setTranscribeProgress({ current: 0, total: audioSegmentsRef.current.length });

        try {
            const transcripts: string[] = [];

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
            toast.success('Audio transcribed. Generating selected documents...');
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
        if (!generateNote && !generateLetter && !generatePatientSummary) {
            toast.error('Select at least one document to generate');
            return;
        }
        if (!transcript.trim()) {
            toast.error('Please enter or record a transcript');
            return;
        }

        runSmartNoteGeneration(transcript.trim());
    };

    const StatusIndicator = ({ status, label }: { status: GenerationStatus; label: string }) => {
        if (status === 'idle') return null;

        return (
            <div className="flex items-center gap-2 text-xs">
                {status === 'generating' && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
                {status === 'success' && <Check className="h-3.5 w-3.5 text-green-500" />}
                {status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                <span className={
                    status === 'generating' ? 'text-blue-600' :
                        status === 'success' ? 'text-green-600 font-medium' :
                            'text-red-600 font-medium'
                }>
                    {label}
                    {status === 'generating' && '...'}
                </span>
            </div>
        );
    };

    const handleConsultTypeChange = (next: NoteType) => {
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
    };

    const hasGenerationActivity =
        generationState.transcript !== 'idle' ||
        generationState.note !== 'idle' ||
        generationState.letter !== 'idle' ||
        generationState.patientSummary !== 'idle' ||
        generationState.tasks !== 'idle';

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
        <Dialog open={open} onOpenChange={handleOpenChange}>
            {!isControlled && (
                <DialogTrigger asChild>
                    {triggerButton}
                </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-[96vw] xl:max-w-[1440px] h-[92vh] flex flex-col p-4 gap-3 overflow-hidden">
                {/* Compact Header */}
                <DialogHeader className="pb-1 border-b border-slate-100 flex-shrink-0">
                    <DialogTitle className="flex items-center justify-between gap-2 text-base">
                        <div className="flex items-center gap-2 min-w-0">
                            {mode === 'quick-record' || inputMode === 'record' ? (
                                <div className={`p-1 rounded-lg ${isRecording ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                                    <Mic className={`h-4 w-4 ${isRecording ? 'animate-pulse' : ''}`} />
                                </div>
                            ) : (
                                <Sparkles className="h-4 w-4 text-amber-500" />
                            )}
                            <span className="font-semibold text-slate-900 truncate">{patientName}</span>
                            <span className="text-xs font-medium text-slate-500 hidden sm:inline">
                                • {noteType === 'new_consult' ? 'New Consult' : 'Review Consult'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 pr-6">
                            {isRecording && (
                                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                                    <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                                    Live {formatDuration(recordingDuration)}
                                </span>
                            )}
                            {isTranscribing && transcribeProgress && (
                                <span className="text-xs font-medium text-indigo-600 animate-pulse">
                                    Transcribing {transcribeProgress.current}/{transcribeProgress.total}...
                                </span>
                            )}
                        </div>
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Zero-scroll consultation recording cockpit for {patientName}
                    </DialogDescription>
                </DialogHeader>

                {/* Single-Row Compact Top Action Toolbar (always visible, zero scroll) */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 flex-shrink-0">
                    {/* Left: Primary Recording / Input Control */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {inputMode === 'record' ? (
                            <>
                                {!isRecording && !hasRecording && (
                                    <Button
                                        type="button"
                                        onClick={startRecording}
                                        size="sm"
                                        className="h-9 px-3.5 gap-2 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-semibold shadow-xs"
                                    >
                                        <Mic className="h-4 w-4" />
                                        Start Recording
                                    </Button>
                                )}

                                {isRecording && (
                                    <Button
                                        type="button"
                                        onClick={stopRecording}
                                        variant="destructive"
                                        size="sm"
                                        className="h-9 px-3.5 gap-2 font-semibold shadow-xs ring-2 ring-red-200"
                                    >
                                        <Square className="h-3.5 w-3.5 fill-white" />
                                        Stop &amp; Generate ({formatDuration(recordingDuration)})
                                    </Button>
                                )}

                                {!isRecording && hasRecording && (
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            type="button"
                                            onClick={startRecording}
                                            variant="outline"
                                            size="sm"
                                            className="h-8 px-2.5 gap-1.5 bg-white text-xs"
                                            disabled={isTranscribing || isPreparing || isGeneratingClinical}
                                        >
                                            <Mic className="h-3.5 w-3.5" />
                                            Re-record
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={transcribeAudio}
                                            disabled={isTranscribing || audioSizeMB > MAX_TOTAL_MB}
                                            size="sm"
                                            className="h-8 px-3 gap-1.5 text-xs"
                                        >
                                            {isTranscribing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                            {isTranscribing ? 'Transcribing...' : `Transcribe (${audioSizeMB.toFixed(1)} MB)`}
                                        </Button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setInputMode('record')}
                                className="h-8 px-2.5 gap-1.5 bg-white text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                            >
                                <Mic className="h-3.5 w-3.5" />
                                Switch to Record
                            </Button>
                        )}

                        {/* Consult Type Segmented Pill */}
                        <div className="inline-flex items-center rounded-lg bg-slate-200/70 p-0.5 border border-slate-200">
                            <button
                                type="button"
                                onClick={() => handleConsultTypeChange('review_consult')}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                                    noteType === 'review_consult'
                                        ? 'bg-white text-slate-900 shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                Review
                            </button>
                            <button
                                type="button"
                                onClick={() => handleConsultTypeChange('new_consult')}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                                    noteType === 'new_consult'
                                        ? 'bg-white text-slate-900 shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                New
                            </button>
                        </div>

                        {/* Compact Template Select */}
                        <Select
                            value={templateType}
                            onValueChange={(v) => setTemplateType(v as TemplateType)}
                            disabled={!generateLetter}
                        >
                            <SelectTrigger className="h-8 w-[125px] bg-white text-xs">
                                <SelectValue placeholder="Template" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="general">General GI</SelectItem>
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

                    {/* Right: Quick Option Pills + More Popover */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setIsComplex(prev => !prev)}
                            disabled={!generateLetter}
                            aria-pressed={isComplex}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                isComplex
                                    ? 'bg-purple-100 text-purple-800 border-purple-300'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="Produces a more comprehensive letter covering all transcript-supported clinical details"
                        >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Detailed</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setGeneratePatientSummary(prev => !prev)}
                            disabled={isPreparing || isGeneratingClinical || isTranscribing}
                            aria-pressed={generatePatientSummary}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                generatePatientSummary
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-2xs'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                        >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>{generatePatientSummary ? '✓ Patient Summary' : '+ Patient Summary'}</span>
                        </button>

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-2.5 gap-1.5 bg-white text-xs"
                                >
                                    <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                                    <span>More</span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-80 space-y-4 p-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold">Input Mode</Label>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={inputMode === 'record' ? 'default' : 'outline'}
                                            onClick={() => setInputMode('record')}
                                            className="h-8 text-xs gap-1.5"
                                        >
                                            <Mic className="h-3.5 w-3.5" />
                                            Record Audio
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={inputMode === 'paste' ? 'default' : 'outline'}
                                            onClick={() => setInputMode('paste')}
                                            className="h-8 text-xs gap-1.5"
                                        >
                                            <FileText className="h-3.5 w-3.5" />
                                            Paste Text
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold">Outputs</Label>
                                    <div className="flex flex-col gap-2 text-xs">
                                        <label className="inline-flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={generateNote}
                                                onChange={e => setGenerateNote(e.target.checked)}
                                                className="accent-blue-600"
                                            />
                                            <FileText className="h-3.5 w-3.5 text-blue-600" />
                                            <span>Consult note</span>
                                        </label>
                                        <label className="inline-flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={generateLetter}
                                                onChange={e => setGenerateLetter(e.target.checked)}
                                                className="accent-purple-600"
                                            />
                                            <Mail className="h-3.5 w-3.5 text-purple-600" />
                                            <span>Referrer letter</span>
                                        </label>
                                        <div className="flex items-center justify-between pt-1">
                                            <Label htmlFor="more-extract-tasks" className="text-xs font-normal">
                                                Extract follow-up tasks
                                            </Label>
                                            <Switch
                                                id="more-extract-tasks"
                                                checked={extractTasksRequested}
                                                onCheckedChange={setExtractTasksRequested}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Letter Style</Label>
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
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="new">New Letter</SelectItem>
                                                <SelectItem value="review">Review Letter</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Pronouns</Label>
                                        <Select
                                            value={pronouns}
                                            onValueChange={(v) => setPronouns(v as any)}
                                            disabled={!generateLetter}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="auto">Auto</SelectItem>
                                                <SelectItem value="he_him">He/Him</SelectItem>
                                                <SelectItem value="she_her">She/Her</SelectItem>
                                                <SelectItem value="they_them">They/Them</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label htmlFor="encounter-date" className="text-xs">Encounter Date</Label>
                                    <Input
                                        id="encounter-date"
                                        type="date"
                                        value={encounterDate}
                                        onChange={(e) => setEncounterDate(e.target.value)}
                                        className="h-8 text-xs"
                                    />
                                </div>

                                <div className="rounded-md bg-slate-50 border border-slate-200 px-2.5 py-2 text-[11px] text-slate-600 leading-snug">
                                    <div><span className="font-semibold">Letters:</span> {CONSULT_LETTER_MODEL}</div>
                                    <div><span className="font-semibold">Notes &amp; Summary:</span> {CONSULT_NOTE_MODEL}</div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {/* Zero-Scroll 2-Pane Cockpit Body */}
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(440px,1.08fr)] gap-4">
                    {/* LEFT PANE: Notes / Transcript + Live Generation Status */}
                    <div className="flex flex-col min-h-0 gap-3">
                        {inputMode === 'paste' ? (
                            <>
                                <div className="flex-1 min-h-0 flex flex-col gap-1.5">
                                    <Label htmlFor="transcript" className="text-xs font-semibold text-slate-700">
                                        Consultation Transcript
                                    </Label>
                                    <Textarea
                                        id="transcript"
                                        value={transcript}
                                        onChange={(e) => setTranscript(e.target.value)}
                                        placeholder="Paste your consultation transcript here..."
                                        className="flex-1 min-h-0 resize-none text-sm leading-relaxed"
                                    />
                                </div>
                                <div className="h-24 flex-shrink-0 flex flex-col gap-1">
                                    <Label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                        <PenLine className="h-3.5 w-3.5 text-indigo-600" />
                                        <span>Additional Typed Notes</span>
                                        <span className="text-[10px] font-normal text-slate-400">(appended to consult note)</span>
                                    </Label>
                                    <Textarea
                                        value={typedNotes}
                                        onChange={(e) => setTypedNotes(e.target.value)}
                                        placeholder="Quick observations, exam findings, or typed reminders..."
                                        disabled={isPreparing || isGeneratingClinical}
                                        className="flex-1 min-h-0 text-xs resize-none"
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex-1 min-h-0 flex flex-col gap-1.5">
                                    <Label className="flex items-center justify-between text-xs font-semibold text-slate-700">
                                        <span className="flex items-center gap-1.5">
                                            <PenLine className="h-3.5 w-3.5 text-indigo-600" />
                                            <span>Consultation Notes</span>
                                            <span className="text-[10px] font-normal text-slate-400">(always visible — appended to consult note)</span>
                                        </span>
                                    </Label>
                                    <Textarea
                                        value={typedNotes}
                                        onChange={(e) => setTypedNotes(e.target.value)}
                                        placeholder="Type exam findings, med doses, reminders, or clinical observations while consulting..."
                                        disabled={isPreparing || isGeneratingClinical}
                                        className="flex-1 min-h-0 text-sm leading-relaxed resize-none bg-white"
                                    />
                                </div>

                                {transcript && (
                                    <div className="h-32 flex-shrink-0 flex flex-col gap-1">
                                        <Label className="text-xs font-semibold text-slate-700">Transcribed Text</Label>
                                        <Textarea
                                            value={transcript}
                                            onChange={(e) => setTranscript(e.target.value)}
                                            className="flex-1 min-h-0 text-xs resize-none bg-slate-50"
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        {/* Generation Progress & Risk Warnings (fixed at bottom of left pane when active) */}
                        {hasGenerationActivity && (
                            <div className={`flex-shrink-0 rounded-xl border p-3 space-y-2 ${
                                letterRiskMatches.length > 0
                                    ? 'border-red-300 bg-red-50/50'
                                    : letterWarnings.length > 0
                                        ? 'border-amber-300 bg-amber-50/50'
                                        : 'border-slate-200 bg-slate-50'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold text-slate-800">Generation Progress</Label>
                                    {letterRiskMatches.length > 0 && (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                            Review flagged letter before copying
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    <StatusIndicator status={generationState.transcript} label="Saving transcript" />
                                    <StatusIndicator status={generationState.tasks} label="Extracting tasks" />
                                </div>

                                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                    <div className="flex items-center gap-2">
                                        <StatusIndicator status={generationState.note} label="Consult note" />
                                        {generationState.note === 'success' && generatedDocs.note && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-6 px-2 text-xs gap-1 bg-white"
                                                onClick={() => handleCopyGenerated('note', generatedDocs.note)}
                                            >
                                                {copiedDoc === 'note' ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                                                {copiedDoc === 'note' ? 'Copied' : 'Copy Note'}
                                            </Button>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <StatusIndicator status={generationState.letter} label="Referrer letter" />
                                        {generationState.letter === 'success' && generatedDocs.letter && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className={`h-6 px-2 text-xs gap-1 ${
                                                    letterRiskMatches.length > 0
                                                        ? 'bg-red-100 border-red-400 text-red-800 hover:bg-red-200 font-semibold'
                                                        : 'bg-white'
                                                }`}
                                                onClick={() => handleCopyGenerated('letter', generatedDocs.letter)}
                                            >
                                                {copiedDoc === 'letter' ? (
                                                    <Check className="h-3 w-3 text-green-600" />
                                                ) : letterRiskMatches.length > 0 ? (
                                                    <AlertTriangle className="h-3 w-3 text-red-700" />
                                                ) : (
                                                    <Copy className="h-3 w-3" />
                                                )}
                                                {copiedDoc === 'letter' ? 'Copied' : letterRiskMatches.length > 0 ? 'Copy Letter (Flagged)' : 'Copy Letter'}
                                            </Button>
                                        )}
                                    </div>

                                    {generatePatientSummary && (
                                        <div className="flex items-center gap-2">
                                            <StatusIndicator status={generationState.patientSummary} label="Patient summary" />
                                            {generationState.patientSummary === 'success' && generatedDocs.patientSummary && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-6 px-2 text-xs gap-1 bg-white"
                                                    onClick={() => handleCopyGenerated('patientSummary', generatedDocs.patientSummary)}
                                                >
                                                    {copiedDoc === 'patientSummary' ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                                                    {copiedDoc === 'patientSummary' ? 'Copied' : 'Copy Summary'}
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {(letterRiskMatches.length > 0 || letterWarnings.length > 0) && (
                                    <div className="rounded-lg border border-red-200 bg-white p-2.5 text-xs space-y-1 max-h-28 overflow-y-auto">
                                        <p className="font-semibold text-red-800 flex items-center gap-1.5">
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                            Flagged Phrases / Validation Warnings (auto-close paused):
                                        </p>
                                        <ul className="list-disc pl-4 space-y-0.5 text-red-700">
                                            {letterRiskMatches.map((m, idx) => (
                                                <li key={`risk-${idx}`}>
                                                    <span className="font-medium">&ldquo;{m.matchedText}&rdquo;</span> — {m.label}
                                                </li>
                                            ))}
                                            {letterWarnings
                                                .filter(w => !letterRiskMatches.some(m => w.includes(m.matchedText)))
                                                .map((w, idx) => (
                                                    <li key={`warn-${idx}`} className="text-amber-800">{w}</li>
                                                ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* RIGHT PANE: Tabbed Clinical Snapshot (Default) | Prior Notes | Ask AI */}
                    <aside className="hidden lg:flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <Tabs defaultValue="snapshot" className="flex-1 min-h-0 flex flex-col">
                            <div className="border-b border-slate-200 bg-slate-50/70 px-3 py-2 flex items-center justify-between flex-shrink-0">
                                <TabsList className="h-8 bg-slate-200/70">
                                    <TabsTrigger value="snapshot" className="text-xs px-2.5 py-1 gap-1.5">
                                        <Stethoscope className="h-3.5 w-3.5" />
                                        Clinical Snapshot
                                    </TabsTrigger>
                                    <TabsTrigger value="prior" className="text-xs px-2.5 py-1 gap-1.5">
                                        <FileText className="h-3.5 w-3.5" />
                                        Prior Notes ({priorNotes.length})
                                    </TabsTrigger>
                                    <TabsTrigger value="ai" className="text-xs px-2.5 py-1 gap-1.5">
                                        <MessageSquareText className="h-3.5 w-3.5" />
                                        Ask AI
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            <TabsContent value="snapshot" className="flex-1 min-h-0 mt-0 flex flex-col">
                                <ClinicalSnapshotCard
                                    patientId={patientId}
                                    initialSnapshot={initialSnapshot}
                                    priorNotes={priorNotes}
                                    mode="cockpit"
                                />
                            </TabsContent>

                            <TabsContent value="prior" className="flex-1 min-h-0 mt-0 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                                {priorNotes.length === 0 ? (
                                    <div className="h-full min-h-48 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-white px-6 text-center">
                                        <div>
                                            <FileText className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                                            <p className="text-sm font-medium text-slate-600">No previous consult notes found</p>
                                            <p className="mt-1 text-xs text-slate-400">Notes will appear here once this patient has a saved consult.</p>
                                        </div>
                                    </div>
                                ) : priorNotes.map(note => (
                                    <article key={note.id} className="rounded-lg border bg-white p-3.5 shadow-2xs">
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                            <span className="text-xs font-semibold text-indigo-700">
                                                {new Date(`${note.encounterDate}T00:00:00`).toLocaleDateString('en-AU', {
                                                    timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short', year: 'numeric'
                                                })}
                                            </span>
                                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{note.label}</span>
                                        </div>
                                        <div className="prose prose-sm max-w-none text-slate-700">
                                            <ReactMarkdown>{note.content}</ReactMarkdown>
                                        </div>
                                    </article>
                                ))}
                            </TabsContent>

                            <TabsContent value="ai" className="flex-1 min-h-0 mt-0 overflow-y-auto p-3 bg-slate-50/50">
                                <PatientQaWidget patientId={patientId} patientName={patientName} embedded />
                            </TabsContent>
                        </Tabs>
                    </aside>
                </div>

                {/* Compact Footer */}
                <DialogFooter className="pt-2 border-t border-slate-100 flex-shrink-0 flex items-center justify-between sm:justify-between gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenChange(false)}
                        disabled={isPreparing || isGeneratingClinical}
                    >
                        {hasGenerationActivity && !isPreparing && !isGeneratingClinical ? 'Close' : 'Cancel'}
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            onClick={handleGenerate}
                            disabled={isPreparing || isGeneratingClinical || isTranscribing || !transcript.trim() || (!generateNote && !generateLetter && !generatePatientSummary)}
                        >
                            {(isPreparing || isGeneratingClinical) && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                            {isPreparing ? 'Preparing...' : isGeneratingClinical ? 'Generating Documents...' : 'Generate Smart Note'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
