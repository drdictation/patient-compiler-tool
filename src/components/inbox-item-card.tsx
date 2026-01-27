'use client';

import { useState } from 'react';
import { InboxItem } from '@/app/actions';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Paperclip, UserCheck, Trash2 } from 'lucide-react';
import { AssignInboxDialog } from './assign-inbox-dialog';
import { discardInboxItem } from '@/app/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface InboxItemCardProps {
    item: InboxItem;
}

export function InboxItemCard({ item }: InboxItemCardProps) {
    const [isDiscarding, setIsDiscarding] = useState(false);
    const router = useRouter();

    const handleDiscard = async () => {
        if (!confirm('Are you sure you want to discard this item?')) return;

        setIsDiscarding(true);
        try {
            await discardInboxItem(item.id);
            toast.success('Item discarded');
            router.refresh();
        } catch (error: any) {
            toast.error(error.message || 'Failed to discard item');
        } finally {
            setIsDiscarding(false);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const preview = item.raw_content.substring(0, 200);
    const hasMore = item.raw_content.length > 200;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-semibold truncate">
                                {item.sender_name || item.sender_email || 'Unknown Sender'}
                            </span>
                            {item.has_attachments && (
                                <Badge variant="secondary" className="flex items-center gap-1">
                                    <Paperclip className="h-3 w-3" />
                                    {item.attachment_count}
                                </Badge>
                            )}
                        </div>
                        <p className="text-sm font-medium text-muted-foreground truncate">
                            {item.subject}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {formatDate(item.received_at)}
                        </p>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                        <AssignInboxDialog item={item} />
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleDiscard}
                            disabled={isDiscarding}
                            title="Discard"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-0">
                {item.ai_suggested_patient_name && (
                    <div className="mb-3 flex items-center gap-2 text-sm">
                        <UserCheck className="h-4 w-4 text-green-600" />
                        <span className="text-muted-foreground">AI suggests:</span>
                        <Badge variant="outline" className="font-medium">
                            {item.ai_suggested_patient_name}
                        </Badge>
                        {item.ai_confidence && (
                            <span className="text-xs text-muted-foreground">
                                ({Math.round(item.ai_confidence * 100)}% confident)
                            </span>
                        )}
                    </div>
                )}

                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {preview}
                    {hasMore && '...'}
                </p>
            </CardContent>
        </Card>
    );
}
