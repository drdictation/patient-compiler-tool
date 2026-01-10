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
type GenerationStatus = 'idle' | 'generating' | 'success' | 'error';

interface GenerationState {
    transcript: GenerationStatus;
    note: GenerationStatus;
    letter: GenerationStatus;
}

export function SmartNoteDialog({ patientId, patientName, asMobileButton = false }: SmartNoteDialogProps) {
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    // Input mode
    const [inputMode, setInputMode] = useState<InputMode>('paste');

    // Transcript
    const [transcript, setTranscript] = useState('');

    // Audio recording state (Phase 2)
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Generation options
    const [noteType, setNoteType] = useState<NoteType>('new_consult');
    const [encounterDate, setEncounterDate] = useState(new Date().toISOString().split('T')[0]);
    const [generateNote, setGenerateNote] = useState(true);
    const [generateLetter, setGenerateLetter] = useState(false);
    const [letterType, setLetterType] = useState<LetterType>('new');
    const [model, setModel] = useState<SmartNoteModel>('gemini-2.5-flash');

    // Generation status
    const [generationState, setGenerationState] = useState<GenerationState>({
        transcript: 'idle',
        note: 'idle',
        letter: 'idle'
    });

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (mediaRecorderRef.current && isRecording) {
                mediaRecorderRef.current.stop();
            }
        };
    }, [isRecording]);

    const resetState = () => {
        setTranscript('');
        setNoteType('new_consult');
        setEncounterDate(new Date().toISOString().split('T')[0]);
        setGenerateNote(true);
        setGenerateLetter(false);
        setLetterType('new');
        setModel('gemini-2.5-flash');
        setGenerationState({ transcript: 'idle', note: 'idle', letter: 'idle' });
        setRecordingDuration(0);
        setIsRecording(false);
        setIsTranscribing(false);
        audioChunksRef.current = [];
    };

    // Audio recording functions
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingDuration(0);

            timerRef.current = setInterval(() => {
                setRecordingDuration((d) => d + 1);
            }, 1000);

        } catch (error) {
            toast.error('Could not access microphone');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            setIsRecording(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    };

    const transcribeAudio = async () => {
        if (audioChunksRef.current.length === 0) {
            toast.error('No audio recorded');
            return;
        }

        setIsTranscribing(true);
        try {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('file', audioBlob, 'recording.webm');

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Transcription failed');
            }

            const data = await response.json();
            setTranscript(data.transcript);
            toast.success('Audio transcribed successfully');
        } catch (error) {
            toast.error('Failed to transcribe audio');
        } finally {
            setIsTranscribing(false);
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
            letter: generateLetter ? 'generating' : 'idle'
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
                        letterType: generateLetter ? letterType : undefined
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
                        : 'idle'
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
                    toast.success(`Created ${successCount} artifact(s) successfully`);
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
                    letter: generateLetter ? 'error' : 'idle'
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
                                {!isRecording && audioChunksRef.current.length === 0 && (
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

                                {!isRecording && audioChunksRef.current.length > 0 && (
                                    <div className="text-center space-y-3">
                                        <p className="text-sm text-muted-foreground">
                                            Recording complete ({formatDuration(recordingDuration)})
                                        </p>
                                        <div className="flex justify-center gap-2">
                                            <Button onClick={startRecording} variant="outline" className="gap-2">
                                                <Mic className="h-4 w-4" />
                                                Re-record
                                            </Button>
                                            <Button onClick={transcribeAudio} disabled={isTranscribing} className="gap-2">
                                                {isTranscribing && <Loader2 className="h-4 w-4 animate-spin" />}
                                                {isTranscribing ? 'Transcribing...' : 'Transcribe'}
                                            </Button>
                                        </div>
                                    </div>
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

                    {/* Configuration Section */}
                    <div className="grid grid-cols-2 gap-6">
                        {/* Encounter Date */}
                        <div className="space-y-3">
                            <Label htmlFor="encounter-date">Encounter Date</Label>
                            <Input
                                id="encounter-date"
                                type="date"
                                value={encounterDate}
                                onChange={(e) => setEncounterDate(e.target.value)}
                                className="w-full"
                            />
                        </div>

                        {/* Model Selection */}
                        <div className="space-y-3">
                            <Label>Model</Label>
                            <Select value={model} onValueChange={(v) => setModel(v as SmartNoteModel)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                                    <SelectItem value="gemini-3.0-flash">Gemini 3.0 Flash</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Note Type & Outputs */}
                    <div className="grid grid-cols-2 gap-6">
                        {/* Note Type */}
                        <div className="space-y-3">
                            <Label>Note Type</Label>
                            <RadioGroup value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
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
                    </div>

                    {/* Output Selection */}
                    <div className="space-y-4">
                        <Label>Generate Outputs</Label>

                        <div className="space-y-3">
                            <div className="flex items-center space-x-3">
                                <Checkbox
                                    id="generateNote"
                                    checked={generateNote}
                                    onCheckedChange={(c) => setGenerateNote(!!c)}
                                />
                                <Label htmlFor="generateNote" className="flex items-center gap-2 font-normal cursor-pointer">
                                    <FileText className="h-4 w-4" />
                                    Generate Consult Note
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
                                    Generate Letter
                                </Label>
                            </div>

                            {generateLetter && (
                                <div className="ml-7 mt-2">
                                    <Select value={letterType} onValueChange={(v) => setLetterType(v as LetterType)}>
                                        <SelectTrigger className="w-[200px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="new">New Letter</SelectItem>
                                            <SelectItem value="review">Review Letter</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Generation Status */}
                    {(generationState.transcript !== 'idle' ||
                        generationState.note !== 'idle' ||
                        generationState.letter !== 'idle') && (
                            <div className="border rounded-lg p-4 bg-gray-50 space-y-2">
                                <Label className="text-sm font-medium">Generation Progress</Label>
                                <StatusIndicator status={generationState.transcript} label="Saving transcript" />
                                <StatusIndicator status={generationState.note} label="Generating note" />
                                <StatusIndicator status={generationState.letter} label="Generating letter" />
                            </div>
                        )}
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleGenerate} disabled={isPending || !transcript.trim()}>
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {isPending ? 'Generating...' : 'Generate'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
