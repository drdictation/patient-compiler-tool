'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Mic, Square, Loader2, CheckCircle2, ChevronDown, ChevronUp, FileText, AlertCircle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { getMelbourneDate } from '@/lib/date-time';
import { prepareSmartNoteGeneration, generateClinicalDocuments, extractAndSaveTasks, SmartNoteOptions } from '@/app/actions';
import { CONSULT_NOTE_MODEL } from '@/lib/model-config';
import { requestScreenWakeLock, releaseScreenWakeLock } from '@/lib/audio/wake-lock';
import { saveLocalAudioDraft, clearLocalAudioDraft } from '@/lib/audio/local-cache';
import ReactMarkdown from 'react-markdown';

interface PriorNote {
    id: string;
    encounterDate: string;
    label: string;
    content: string;
}

interface MobileConsultSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    patientId: string;
    patientName: string;
    priorNotes?: PriorNote[];
}

export function MobileConsultSheet({
    open,
    onOpenChange,
    patientId,
    patientName,
    priorNotes = []
}: MobileConsultSheetProps) {
    const router = useRouter();

    // Consult settings
    const [isNewConsult, setIsNewConsult] = useState(false);
    const [encounterDate] = useState(getMelbourneDate);

    // Audio recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processStep, setProcessStep] = useState<string>('');
    const [wakeLockActive, setWakeLockActive] = useState(false);
    const [showPriorNotes, setShowPriorNotes] = useState(false);

    // Audio level visualizer state
    const [audioLevels, setAudioLevels] = useState<number[]>(Array(24).fill(10));

    // MediaRecorder and Web Audio refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioSegmentsRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isRecordingRef = useRef(false);
    const mimeTypeRef = useRef<string>('audio/webm');
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animFrameRef = useRef<number | null>(null);

    // Format duration mm:ss
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Clean up on unmount or sheet close
    const cleanupAudio = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            try {
                mediaRecorderRef.current.stop();
            } catch {}
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            try {
                audioContextRef.current.close();
            } catch {}
            audioContextRef.current = null;
        }
        releaseScreenWakeLock();
        setWakeLockActive(false);
        setIsRecording(false);
        isRecordingRef.current = false;
    }, []);

    useEffect(() => {
        if (!open) {
            cleanupAudio();
            setIsProcessing(false);
            setRecordingDuration(0);
            audioChunksRef.current = [];
            audioSegmentsRef.current = [];
        }
    }, [open, cleanupAudio]);

    // Setup audio visualizer analyzer
    const setupVisualizer = (stream: MediaStream) => {
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            const audioCtx = new AudioCtx();
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);

            audioContextRef.current = audioCtx;
            analyserRef.current = analyser;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const updateWaveform = () => {
                if (!isRecordingRef.current) return;
                analyser.getByteFrequencyData(dataArray);

                // Sample 24 bars
                const bars: number[] = [];
                const step = Math.max(1, Math.floor(bufferLength / 24));
                for (let i = 0; i < 24; i++) {
                    const val = dataArray[i * step] || 0;
                    // Scale between 8px and 44px
                    const height = Math.max(8, Math.min(44, (val / 255) * 44));
                    bars.push(height);
                }
                setAudioLevels(bars);
                animFrameRef.current = requestAnimationFrame(updateWaveform);
            };

            updateWaveform();
        } catch (e) {
            console.warn('[Visualizer] Could not start audio visualizer:', e);
        }
    };

    // Start Recording
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Keep screen awake while recording
            const locked = await requestScreenWakeLock();
            setWakeLockActive(locked);

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            mimeTypeRef.current = mimeType;

            audioSegmentsRef.current = [];
            audioChunksRef.current = [];

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                audioBitsPerSecond: 16000,
            });

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                    // Cache draft locally in browser IndexedDB (zero Supabase storage)
                    saveLocalAudioDraft({
                        patientId,
                        patientName,
                        noteType: isNewConsult ? 'new_consult' : 'review_consult',
                        chunks: audioChunksRef.current,
                        mimeType,
                    });
                }
            };

            mediaRecorder.start(1000); // 1-second slices so chunks are saved progressively
            mediaRecorderRef.current = mediaRecorder;

            setIsRecording(true);
            isRecordingRef.current = true;
            setRecordingDuration(0);

            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);

            // Connect real-time visualizer
            setupVisualizer(stream);

            toast.info('Recording started');
        } catch (err: any) {
            console.error('[MobileConsult] Mic access failed:', err);
            toast.error(`Microphone error: ${err.message || 'Permission denied'}`);
        }
    };

    // Complete & Generate pipeline
    const completeAndGenerate = async () => {
        if (!mediaRecorderRef.current || !isRecording) return;

        // Ensure Wake Lock stays ON during the entire AI generation phase
        const locked = await requestScreenWakeLock();
        setWakeLockActive(locked);

        setIsRecording(false);
        isRecordingRef.current = false;
        if (timerRef.current) clearInterval(timerRef.current);

        // Stop media recorder cleanly
        mediaRecorderRef.current.stop();

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }

        setIsProcessing(true);
        setProcessStep('Finalizing audio...');

        // Allow final ondataavailable to fire
        await new Promise(res => setTimeout(res, 300));

        const allChunks = audioChunksRef.current;
        if (allChunks.length === 0) {
            toast.error('No audio recorded');
            setIsProcessing(false);
            releaseScreenWakeLock();
            setWakeLockActive(false);
            return;
        }

        const audioBlob = new Blob(allChunks, { type: mimeTypeRef.current });
        console.log(`[MobileConsult] Audio size: ${(audioBlob.size / (1024 * 1024)).toFixed(2)} MB`);

        try {
            // Step 1: Transcribe via Groq Whisper in memory (Audio is never stored in Supabase)
            setProcessStep('Transcribing consultation (Groq Whisper)...');
            const formData = new FormData();
            formData.append('file', audioBlob, 'consult.webm');

            const transcribeRes = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
            });

            if (!transcribeRes.ok) {
                const errData = await transcribeRes.json().catch(() => ({}));
                throw new Error(errData.error || `Transcription failed (${transcribeRes.status})`);
            }

            const { transcript } = await transcribeRes.json();
            if (!transcript || !transcript.trim()) {
                throw new Error('No speech detected in recording.');
            }

            // Step 2: Prepare Context & Save RAW_TRANSCRIPT text
            setProcessStep('Generating specialist letter & consult note...');
            const noteTypeVal = isNewConsult ? 'new_consult' : 'review_consult';
            const letterTypeVal = isNewConsult ? 'new' : 'review';

            const options: SmartNoteOptions = {
                patientId,
                patientName,
                date: encounterDate,
                transcript: transcript.trim(),
                noteType: noteTypeVal,
                outputs: {
                    generateNote: true,
                    generateLetter: true,
                    letterType: letterTypeVal,
                    templateType: 'general',
                    isComplex: false,
                    pronouns: 'auto'
                },
                extractTasks: true,
                model: CONSULT_NOTE_MODEL
            };

            const context = await prepareSmartNoteGeneration(options);

            // Step 3: Run concurrent generation (GPT-5.6 Luna letter + Gemini 3.1 note)
            const clinicalPromise = generateClinicalDocuments(context);
            // Detached task extraction
            extractAndSaveTasks(context).catch(e => console.warn('[MobileConsult] Task extraction background error:', e));

            const clinicalResult = await clinicalPromise;

            const letterSuccess = clinicalResult.letter?.status === 'success';
            const noteSuccess = clinicalResult.note?.status === 'success';

            if (!letterSuccess && !noteSuccess) {
                const errMsg = clinicalResult.letter?.error?.message || clinicalResult.note?.error?.message || 'Generation failed';
                throw new Error(errMsg);
            }

            // Successful completion
            // Clear local temporary phone audio cache
            await clearLocalAudioDraft();

            // Haptic completion vibration (100ms vibrate, 50ms pause, 100ms vibrate)
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                try {
                    navigator.vibrate([100, 50, 100]);
                } catch {}
            }

            setProcessStep('Done! Consult note and letter saved.');
            toast.success('Consult note and letter generated successfully!');

            setTimeout(() => {
                cleanupAudio();
                onOpenChange(false);
                router.refresh();
            }, 1200);

        } catch (err: any) {
            console.error('[MobileConsult] Generation error:', err);
            toast.error(err.message || 'Failed to complete consultation');
            setProcessStep('');
            setIsProcessing(false);
            releaseScreenWakeLock();
            setWakeLockActive(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="p-0 rounded-t-3xl max-h-[92vh] flex flex-col border-t bg-white shadow-2xl safe-area-inset-bottom"
            >
                {/* Drag / Pull Indicator */}
                <div className="pt-3 pb-1 flex justify-center">
                    <div className="w-10 h-1 bg-slate-300 rounded-full" />
                </div>

                {/* Header */}
                <div className="px-6 py-2 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <SheetTitle className="text-lg font-bold text-slate-900 leading-snug">
                            {patientName}
                        </SheetTitle>
                        <p className="text-xs text-slate-500 font-medium">
                            Endoscopy Suite Consultation
                        </p>
                    </div>
                    {wakeLockActive && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Awake
                        </span>
                    )}
                </div>

                {/* Main Body */}
                <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col items-center justify-center space-y-6">

                    {/* Timer Display */}
                    <div className="text-center">
                        <div className="font-mono text-5xl font-extrabold tracking-tight text-slate-900">
                            {formatDuration(recordingDuration)}
                        </div>
                        <p className="text-xs font-semibold tracking-wide uppercase text-slate-400 mt-1">
                            {isRecording ? 'Live Dictation' : isProcessing ? 'Processing' : 'Ready to record'}
                        </p>
                    </div>

                    {/* Audio Waveform Visualizer */}
                    <div className="w-full max-w-xs h-12 flex items-center justify-center gap-1.5 px-4 bg-slate-50/80 rounded-2xl border border-slate-100">
                        {audioLevels.map((lvl, idx) => (
                            <div
                                key={idx}
                                style={{ height: isRecording ? `${lvl}px` : '8px' }}
                                className={`w-1.5 rounded-full transition-all duration-75 ${
                                    isRecording 
                                        ? 'bg-rose-500 shadow-xs' 
                                        : 'bg-slate-300'
                                }`}
                            />
                        ))}
                    </div>

                    {/* Main Action Button */}
                    <div className="w-full max-w-sm pt-2">
                        {!isRecording && !isProcessing && (
                            <Button
                                size="lg"
                                onClick={startRecording}
                                className="w-full h-14 text-base font-bold gap-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white shadow-lg active:scale-[0.98] transition-all"
                            >
                                <Mic className="h-6 w-6" />
                                Start Recording
                            </Button>
                        )}

                        {isRecording && (
                            <Button
                                size="lg"
                                onClick={completeAndGenerate}
                                className="w-full h-14 text-base font-bold gap-2.5 rounded-2xl border-2 border-red-500 bg-white text-red-600 hover:bg-red-50 active:scale-[0.98] shadow-lg ring-4 ring-red-100 animate-pulse transition-all"
                            >
                                <Square className="h-5 w-5 fill-red-600" />
                                Complete &amp; Generate
                            </Button>
                        )}

                        {isProcessing && (
                            <Button
                                size="lg"
                                disabled
                                className="w-full h-14 text-sm font-semibold gap-2.5 rounded-2xl bg-slate-900 text-white shadow-md cursor-not-allowed"
                            >
                                <Loader2 className="h-5 w-5 animate-spin text-rose-400" />
                                <span>{processStep || 'Processing...'}</span>
                            </Button>
                        )}
                    </div>

                    {/* Consult Type Segmented Toggle */}
                    {!isProcessing && (
                        <div className="flex items-center justify-between w-full max-w-sm bg-slate-100/90 p-1.5 rounded-xl border border-slate-200/80">
                            <button
                                type="button"
                                onClick={() => setIsNewConsult(false)}
                                disabled={isRecording}
                                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                                    !isNewConsult 
                                        ? 'bg-white text-slate-900 shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                Review Consult (Default)
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsNewConsult(true)}
                                disabled={isRecording}
                                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                                    isNewConsult 
                                        ? 'bg-white text-slate-900 shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                New Consult
                            </button>
                        </div>
                    )}

                    {/* View Prior Notes Accordion */}
                    <div className="w-full max-w-sm">
                        <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => setShowPriorNotes(!showPriorNotes)}
                            className="w-full justify-between text-xs font-medium border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl h-10"
                        >
                            <span className="flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-slate-400" />
                                View Prior Notes ({priorNotes.length})
                            </span>
                            {showPriorNotes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>

                        {showPriorNotes && (
                            <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-48 overflow-y-auto space-y-3 text-xs">
                                {priorNotes.length === 0 ? (
                                    <p className="text-slate-400 text-center py-2">No prior notes for this patient.</p>
                                ) : (
                                    priorNotes.map(note => (
                                        <div key={note.id} className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-xs">
                                            <div className="flex justify-between text-[11px] font-semibold text-indigo-600 mb-1">
                                                <span>{note.encounterDate}</span>
                                                <span className="text-slate-400 uppercase">{note.label}</span>
                                            </div>
                                            <div className="prose prose-xs max-w-none text-slate-600 line-clamp-4">
                                                <ReactMarkdown>{note.content}</ReactMarkdown>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Screen Wake Lock Status Confirmation */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                        <span>Screen kept awake during dictation and processing</span>
                    </div>

                </div>
            </SheetContent>
        </Sheet>
    );
}
