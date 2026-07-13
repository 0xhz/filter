const ULP_ENTRY_RE = /(?:https?:\/\/)?(?:[^\s:]*?):([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}):(.+?)(?=(?:https?:\/\/)|(?<=[0-9])(?=[a-zA-Z][a-zA-Z0-9-]*\.[a-zA-Z]{2,})|$)/g;

export function parseULPLine(text) {
    const results = [];
    const re = new RegExp(ULP_ENTRY_RE.source, ULP_ENTRY_RE.flags);
    let match;

    while ((match = re.exec(text)) !== null) {
        const login = match[1];
        const password = match[2].trim();
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
        results.push(...parseULPLine(trimmed));
    }

    return { results, carry: newCarry, linesProcessed };
}

export function flushULPCarry(carry) {
    const trimmed = carry.trim();
    if (!trimmed) return [];
    return parseULPLine(trimmed);
}