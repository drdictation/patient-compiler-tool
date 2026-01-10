
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RotateCw } from 'lucide-react';

export function SyncButton() {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSync = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/sync', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(`Sync complete! Added ${data.count} records.`);
                router.refresh();
            } else {
                alert(`Sync failed: ${data.error}`);
            }
        } catch (e) {
            alert('Sync failed connection');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            onClick={handleSync}
            disabled={loading}
            variant="outline"
            className="gap-2"
        >
            <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Syncing...' : 'Sync Now'}
        </Button>
    );
}
