import { getPendingInboxItems } from '@/app/actions';
import { InboxList } from '@/components/inbox-list';
import { PollInboxButton } from '@/components/poll-inbox-button';
import { Inbox as InboxIcon } from 'lucide-react';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
    const items = await getPendingInboxItems();

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="mb-6">
                <Link href="/">
                    <Button variant="ghost" size="sm" className="pl-0 gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Dashboard
                    </Button>
                </Link>
            </div>

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <InboxIcon className="h-8 w-8" />
                        Inbox
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {items.length} pending {items.length === 1 ? 'item' : 'items'}
                    </p>
                </div>
                <PollInboxButton />
            </div>

            <InboxList initialItems={items} />
        </div>
    );
}
