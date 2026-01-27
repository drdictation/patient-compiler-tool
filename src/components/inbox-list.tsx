'use client';

import { useState, useEffect } from 'react';
import { InboxItem } from '@/app/actions';
import { InboxItemCard } from './inbox-item-card';

interface InboxListProps {
    initialItems: InboxItem[];
}

export function InboxList({ initialItems }: InboxListProps) {
    const [items, setItems] = useState(initialItems);

    useEffect(() => {
        setItems(initialItems);
    }, [initialItems]);

    if (items.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg">No pending items</p>
                <p className="text-sm mt-2">Click "Check Inbox" to poll for new emails</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {items.map((item) => (
                <InboxItemCard key={item.id} item={item} />
            ))}
        </div>
    );
}
