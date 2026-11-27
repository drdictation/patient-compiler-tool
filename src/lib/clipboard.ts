'use client';

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatInlineMarkdownToHtml(text: string, baseStyle: string): string {
    let html = escapeHtml(text);
    // Bold (**text** or __text__)
    html = html.replace(/\*\*([^*]+)\*\*/g, `<strong style="${baseStyle} font-weight: bold;">$1</strong>`);
    html = html.replace(/__([^_]+)__/g, `<strong style="${baseStyle} font-weight: bold;">$1</strong>`);
    // Italic (*text* or _text_)
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    return html;
}

/**
 * Converts Markdown into clean Arial 10pt inline-styled HTML compatible with Genie / Best Practice / Word,
 * and copies both text/html and text/plain to the clipboard.
 */
export async function copyMarkdownAsRichHtml(markdown: string): Promise<'rich' | 'plain'> {
    const baseStyle = 'font-family: Arial, sans-serif; font-size: 10pt;';
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const htmlParts: string[] = [];
    const plainLines: string[] = [];

    let listType: 'ul' | 'ol' | null = null;

    const closeList = () => {
        if (listType) {
            htmlParts.push(`</${listType}>`);
            listType = null;
        }
    };

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();

        if (!trimmed) {
            closeList();
            plainLines.push('');
            continue;
        }

        // Heading (# ... ######)
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            closeList();
            const headingText = headingMatch[2].replace(/\*\*/g, '');
            htmlParts.push(`<p style="${baseStyle} font-weight: bold; margin-top: 12pt; margin-bottom: 6pt;">${escapeHtml(headingText)}</p>`);
            plainLines.push(headingText);
            continue;
        }

        // Unordered list item (-, *, •)
        const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/);
        if (ulMatch) {
            if (listType !== 'ul') {
                closeList();
                listType = 'ul';
                htmlParts.push(`<ul style="${baseStyle} margin-left: 24pt; padding-left: 0; margin-top: 6pt; margin-bottom: 6pt;">`);
            }
            htmlParts.push(`<li style="${baseStyle} margin: 3pt 0;">${formatInlineMarkdownToHtml(ulMatch[1], baseStyle)}</li>`);
            plainLines.push(`• ${ulMatch[1].replace(/\*\*|__/g, '')}`);
            continue;
        }

        // Ordered list item (1. ...)
        const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
        if (olMatch) {
            if (listType !== 'ol') {
                closeList();
                listType = 'ol';
                htmlParts.push(`<ol style="${baseStyle} margin-left: 24pt; padding-left: 0; margin-top: 6pt; margin-bottom: 6pt;">`);
            }
            htmlParts.push(`<li style="${baseStyle} margin: 3pt 0;">${formatInlineMarkdownToHtml(olMatch[1], baseStyle)}</li>`);
            plainLines.push(trimmed.replace(/\*\*|__/g, ''));
            continue;
        }

        closeList();
        htmlParts.push(`<p style="${baseStyle} margin: 6pt 0;">${formatInlineMarkdownToHtml(trimmed, baseStyle)}</p>`);
        plainLines.push(trimmed.replace(/\*\*|__/g, ''));
    }

    closeList();

    const html = `<div style="${baseStyle}">${htmlParts.join('')}</div>`;
    const plain = plainLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    try {
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([plain], { type: 'text/plain' }),
                }),
            ]);
            return 'rich';
        }
    } catch {
        // Fallback to plain text below
    }

    await navigator.clipboard.writeText(plain || markdown);
    return 'plain';
}
