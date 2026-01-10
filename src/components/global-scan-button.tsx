'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Sparkles, Loader2, Scan } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface GlobalScanButtonProps {
    patientId: string;
    asMobileButton?: boolean;
}

export function GlobalScanButton({ patientId, asMobileButton = false }: GlobalScanButtonProps) {
    const [model, setModel] = useState('gemini-flash');
    const [isScanning, setIsScanning] = useState(false);
    const router = useRouter();

    const handleScanAll = async () => {
        setIsScanning(true);
        const toastId = toast.loading('Scanning patient record...', {
            description: 'Extracting issues, investigations, and interventions...'
        });

        try {
            // Run all extractions in parallel
            const results = await Promise.allSettled([
                fetch(`/api/patient/${patientId}/extract-issues`, {
                    method: 'POST',
                    body: JSON.stringify({ provider: model }),
                    headers: { 'Content-Type': 'application/json' }
                }).then(r => r.json()),

                fetch(`/api/patient/${patientId}/extract-investigations`, {
                    method: 'POST',
                    body: JSON.stringify({ provider: model }),
                    headers: { 'Content-Type': 'application/json' }
                }).then(r => r.json()),

                fetch(`/api/patient/${patientId}/extract-interventions`, {
                    method: 'POST',
                    body: JSON.stringify({ provider: model }),
                    headers: { 'Content-Type': 'application/json' }
                }).then(r => r.json())
            ]);

            // Analyze results
            let successCount = 0;
            let errorCount = 0;
            let newItems = 0;

            results.forEach((result) => {
                if (result.status === 'fulfilled') {
                    if (result.value.error) {
                        errorCount++;
                    } else {
                        successCount++;
                        if (result.value.new) newItems += result.value.new;
                    }
                } else {
                    errorCount++;
                }
            });

            if (errorCount > 0 && successCount === 0) {
                toast.error('Scan failed', { id: toastId, description: 'Could not extract data from records.' });
            } else if (errorCount > 0) {
                toast.warning('Scan partially completed', {
                    id: toastId,
                    description: `Found ${newItems} new items, but some sections failed.`
                });
            } else {
                toast.success('Scan completed successfully', {
                    id: toastId,
                    description: `Found ${newItems} new items across all categories.`
                });
            }

            router.refresh();
        } catch (e: any) {
            toast.error('Scan failed', { id: toastId, description: e.message });
        } finally {
            setIsScanning(false);
        }
    };

    // Mobile button: simple icon-only button that just triggers scan with default model
    if (asMobileButton) {
        return (
            <Button
                variant="ghost"
                size="sm"
                className="flex-col h-auto py-2 px-3 gap-1"
                onClick={handleScanAll}
                disabled={isScanning}
            >
                {isScanning ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                    <Scan className="h-5 w-5" />
                )}
                <span className="text-[10px]">{isScanning ? 'Scanning...' : 'Scan All'}</span>
            </Button>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <Select value={model} onValueChange={setModel} disabled={isScanning}>
                <SelectTrigger className="w-[180px] h-9 text-xs bg-white/50 backdrop-blur-sm">
                    <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="gemini-flash">Gemini 2.5 Flash</SelectItem>
                    <SelectItem value="gemini-flash-lite">Gemini Flash Lite</SelectItem>
                    <SelectItem value="groq-llama-4">Llama 4 Maverick</SelectItem>
                    <SelectItem value="groq-gpt-oss">GPT-OSS 120B</SelectItem>
                    <SelectItem value="groq-llama-3">Llama 3 70B</SelectItem>
                </SelectContent>
            </Select>
            <Button
                onClick={handleScanAll}
                disabled={isScanning}
                className="h-9 gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-sm transition-all"
            >
                {isScanning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Sparkles className="w-4 h-4 text-indigo-100" />
                )}
                {isScanning ? 'Scanning All...' : 'Scan All Records'}
            </Button>
        </div>
    );
}

