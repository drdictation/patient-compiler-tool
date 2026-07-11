/**
 * Gmail Inbox Integration
 * 
 * Polls Gmail for new messages and parses them into inbox items.
 * Uses OAuth2 credentials from environment variables (same pattern as Cognito project).
 */

import { google } from 'googleapis';
import { generateFromPrompt } from './llm';

interface GmailMessage {
    id: string;
    threadId: string;
    snippet: string;
    payload: {
        mimeType?: string;
        headers: Array<{ name: string; value: string }>;
        body?: { data?: string };
        parts?: Array<{
            mimeType: string;
            body?: { data?: string };
            parts?: any[];
        }>;
    };
    internalDate: string;
}

interface ParsedMessage {
    gmailMessageId: string;
    senderEmail: string;
    senderName: string;
    subject: string;
    rawContent: string;
    htmlContent?: string;
    receivedAt: Date;
    hasAttachments: boolean;
    attachmentCount: number;
}

/**
 * Creates Gmail API client using environment variables
 */
export function getGmailClient() {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Missing Gmail OAuth credentials. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in .env.local');
    }

    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'http://localhost:3000/api/auth/callback/google' // Redirect URI (not used for refresh token flow)
    );

    oauth2Client.setCredentials({
        refresh_token: refreshToken,
    });

    return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Polls Gmail inbox for unread messages with a specific label
 * @param labelName - Gmail label to filter by (default: 'INBOX')
 * @param maxResults - Maximum number of messages to fetch (default: 20)
 */
export async function pollInbox(labelName: string = 'INBOX', maxResults: number = 20): Promise<ParsedMessage[]> {
    const gmail = getGmailClient();

    // Fetch unread messages
    const response = await gmail.users.messages.list({
        userId: 'me',
        q: `is:unread label:${labelName}`,
        maxResults,
    });

    const messages = response.data.messages || [];

    if (messages.length === 0) {
        return [];
    }

    // Fetch full message details for each
    const parsedMessages: ParsedMessage[] = [];

    for (const message of messages) {
        if (!message.id) continue;

        try {
            const fullMessage = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'full',
            });

            const parsed = parseMessage(fullMessage.data as GmailMessage);
            parsedMessages.push(parsed);
        } catch (error) {
            console.error(`Failed to fetch message ${message.id}:`, error);
        }
    }

    return parsedMessages;
}

/**
 * Parses a Gmail message into a structured format
 */
function parseMessage(message: GmailMessage): ParsedMessage {
    const headers = message.payload.headers || [];

    // Extract headers
    const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';

    // Parse sender name and email
    const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/) || from.match(/^(.+)$/);
    const senderName = fromMatch?.[1]?.trim() || from;
    const senderEmail = fromMatch?.[2]?.trim() || from;

    // Extract body content
    const { textContent, htmlContent } = extractMessageBody(message.payload);

    // Check for attachments
    const attachmentCount = countAttachments(message.payload);

    return {
        gmailMessageId: message.id,
        senderEmail,
        senderName,
        subject,
        rawContent: textContent || htmlContent || message.snippet || '',
        htmlContent: htmlContent,
        receivedAt: new Date(parseInt(message.internalDate)),
        hasAttachments: attachmentCount > 0,
        attachmentCount,
    };
}

/**
 * Extracts text and HTML content from message payload
 */
function extractMessageBody(payload: GmailMessage['payload']): { textContent: string; htmlContent?: string } {
    let textContent = '';
    let htmlContent: string | undefined;

    // Helper to decode base64url
    const decode = (data: string) => {
        return Buffer.from(data, 'base64url').toString('utf-8');
    };

    // Single-part message
    if (payload.body?.data) {
        const decoded = decode(payload.body.data);
        if (payload.mimeType?.includes('text/html')) {
            htmlContent = decoded;
            textContent = stripHtml(decoded);
        } else {
            textContent = decoded;
        }
        return { textContent, htmlContent };
    }

    // Multi-part message
    if (payload.parts) {
        for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
                textContent = decode(part.body.data);
            } else if (part.mimeType === 'text/html' && part.body?.data) {
                htmlContent = decode(part.body.data);
            } else if (part.parts) {
                // Nested parts (e.g., multipart/alternative)
                const nested = extractMessageBody({ ...payload, parts: part.parts });
                if (!textContent) textContent = nested.textContent;
                if (!htmlContent) htmlContent = nested.htmlContent;
            }
        }
    }

    // Fallback: use HTML and strip tags
    if (!textContent && htmlContent) {
        textContent = stripHtml(htmlContent);
    }

    return { textContent, htmlContent };
}

/**
 * Counts attachments in message payload
 */
function countAttachments(payload: GmailMessage['payload']): number {
    let count = 0;

    const checkPart = (part: any) => {
        if (part.filename && part.filename.length > 0) {
            count++;
        }
        if (part.parts) {
            part.parts.forEach(checkPart);
        }
    };

    if (payload.parts) {
        payload.parts.forEach(checkPart);
    }

    return count;
}

/**
 * Strips HTML tags from content (basic implementation)
 */
function stripHtml(html: string): string {
    return html
        .replace(/<style[^>]*>.*?<\/style>/gi, '')
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
}

/**
 * Marks a Gmail message as read (processed)
 */
export async function markAsProcessed(messageId: string): Promise<void> {
    const gmail = getGmailClient();

    await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
            removeLabelIds: ['UNREAD'],
        },
    });
}

/**
 * Uses AI to suggest a patient match from the message content
 */
export async function suggestPatientMatch(
    content: string,
    subject: string,
    patientList: Array<{ id: string; display_name: string }>
): Promise<{ patientId?: string; patientName?: string; confidence?: number }> {
    if (patientList.length === 0) {
        return {};
    }

    const prompt = `You are analyzing an email to suggest which patient it relates to.

Email Subject: ${subject}
Email Content:
${content.substring(0, 1000)}

Available Patients:
${patientList.map(p => `- ${p.display_name} (ID: ${p.id})`).join('\n')}

Task: Identify which patient this email is most likely about. Look for patient names mentioned in the subject or content.

Respond ONLY with valid JSON in this exact format:
{
    "patientId": "uuid-here" or null,
    "patientName": "Name Here" or null,
    "confidence": 0.0 to 1.0,
    "reasoning": "brief explanation"
}`;

    try {
        const systemInstructions = prompt
            .replace('{{TRANSCRIPT}}', '')
            .replaceAll('{{PATIENT_NAME}}', 'AI');

        const response = await generateFromPrompt({
            systemInstructions,
            transcript: content,
            metadata: {
                patientName: 'AI',
                documentType: 'patient_matching',
                templateType: 'general'
            },
            model: 'gemini-3.1-flash-lite-preview',
            purpose: 'patient_matching'
        });
        const parsed = JSON.parse(response.content);

        return {
            patientId: parsed.patientId || undefined,
            patientName: parsed.patientName || undefined,
            confidence: parsed.confidence || undefined,
        };
    } catch (error) {
        console.error('Failed to suggest patient match:', error);
        return {};
    }
}
