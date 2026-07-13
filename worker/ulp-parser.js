const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_SUFFIX_RE = /(?:https?:\/\/)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s:]*)?:$/;

export function parseULPLine(text) {
    const results = [];
    const emails = [...text.matchAll(EMAIL_RE)];

    for (let i = 0; i < emails.length; i++) {
        const login = emails[i][0];
        const passStart = emails[i].index + login.length + 1;

        let passEnd;
        if (i < emails.length - 1) {
            const nextEmailStart = emails[i + 1].index;
            const between = text.slice(passStart, nextEmailStart);
            const urlMatch = between.match(URL_SUFFIX_RE);

            if (urlMatch) {
                passEnd = passStart + between.length - urlMatch[0].length;
            } else {
                const domainMatch = between.match(
                    /(?:https?:\/\/)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}/
                );
                passEnd = domainMatch
                    ? passStart + between.indexOf(domainMatch[0])
                    : nextEmailStart;
            }
        } else {
            passEnd = text.length;
        }

        const password = text.slice(passStart, passEnd).trim();
        if (login && password) {
            results.push(`${login}:${password}`);
        }
    }

    return results;
}

export function processULPChunk(chunk, carry = '') {
    const combined = carry + chunk;
    const lines = combined.split('\n');
    const newCarry = lines.pop() || '';

    const results = [];
    let linesProcessed = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        linesProcessed++;
        const parsed = parseULPLine(trimmed);
        results.push(...parsed);
    }

    return { results, carry: newCarry, linesProcessed };
}

export function flushULPCarry(carry) {
    const trimmed = carry.trim();
    if (!trimmed) return [];
    return parseULPLine(trimmed);
}