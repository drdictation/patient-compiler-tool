'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { pollGmailInbox } from '@/app/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export function PollInboxButton() {
    const [isPolling, setIsPolling] = useState(false);
    const router = useRouter();

    const handlePoll = async () => {
        setIsPolling(true);
        try {
            const result = await pollGmailInbox();

            if (result.newItems > 0) {
                toast.success(`Found ${result.newItems} new ${result.newItems === 1 ? 'item' : 'items'}`);
                router.refresh();
            } else {
                toast.info('No new items found');
            }

            if (result.errors.length > 0) {
                result.errors.forEach(error => toast.error(error));
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to poll inbox');
        } finally {
            setIsPolling(false);
        }
    };

    return (
        <Button onClick={handlePoll} disabled={isPolling}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isPolling ? 'animate-spin' : ''}`} />
            {isPolling ? 'Checking...' : 'Check Inbox'}
        </Button>
    );
}
