/**
 * Remove common markdown artefacts that make generated clinical letters look
 * templated. This intentionally does not rewrite clinical language: converting
 * a patient's description into a diagnosis requires the context available to
 * the language model, not a regex substitution.
 */
export function postProcessLetter(text: string): string {
    if (!text) return text;

    // Clinical names are sometimes unnecessarily emphasised by the model.
    // Preserve literal asterisks that are not paired markdown emphasis.
    const result = text
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
        .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1');

    const impressionHeading = /^(\s*(?:\*\*)?impression\s+and\s+plan(?:\*\*)?\s*:?)\s*$/im;
    const match = impressionHeading.exec(result);
    if (!match || match.index === undefined) return result;

    const sectionStart = match.index + match[0].length;
    const before = result.slice(0, match.index);
    const heading = match[1].replace(/\s*:$/, '');
    const section = result.slice(sectionStart);

    // Do not accidentally alter a later conventional sign-off.
    const signoffMatch = /^(?:kind regards|yours sincerely|thank you again\b)/im.exec(section);
    const signoffIndex = signoffMatch?.index ?? section.length;
    let body = section.slice(0, signoffIndex);
    const signoff = section.slice(signoffIndex);

    body = body
        .replace(/\*\*([^*\n:]+):\*\*\s*/g, '$1 ')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/^\s*(?:[-•]|\*\s+|\d+[.)])\s+(?:\*\*)?(.+?)(?:\*\*)?\s*$/gm, '$1')
        .replace(/([^.!?\s])\n(?=[^\n])/g, '$1.\n')
        .replace(/\n{3,}/g, '\n\n');

    return `${before}${heading}\n${body}${signoff}`;
}
