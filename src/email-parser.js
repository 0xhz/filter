export function removerTextoDepoisDoEspaco(linha) {
    return linha.split(' ')[0];
}

export function processEmailChunk(chunk, carry, keywords) {
    const combined = carry + chunk;
    const lines = combined.split('\n');
    const newCarry = lines.pop() || '';

    const results = [];
    let linesProcessed = 0;
    const lowerKeywords = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        linesProcessed++;
        const firstWord = removerTextoDepoisDoEspaco(trimmed);
        const lower = firstWord.toLowerCase();
        if (lowerKeywords.some((kw) => lower.includes(kw))) {
            results.push(firstWord);
        }
    }

    return { results, carry: newCarry, linesProcessed };
}

export function flushEmailCarry(carry, keywords) {
    const trimmed = carry.trim();
    if (!trimmed) return [];
    const firstWord = removerTextoDepoisDoEspaco(trimmed);
    const lower = firstWord.toLowerCase();
    const lowerKeywords = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);
    if (lowerKeywords.some((kw) => lower.includes(kw))) {
        return [firstWord];
    }
    return [];
}