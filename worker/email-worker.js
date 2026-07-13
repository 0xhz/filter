function removerTextoDepoisDoEspaco(linha) {
    return linha.split(' ')[0];
}

function processEmailChunk(chunk, carry, keywords) {
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

self.onmessage = (e) => {
    const { type, id, chunk, carry, keywords, finalize } = e.data;

    if (type === 'process') {
        const { results, carry: newCarry, linesProcessed } = processEmailChunk(chunk, carry, keywords);
        let finalResults = results;

        if (finalize) {
            const last = newCarry.trim();
            if (last) {
                const firstWord = removerTextoDepoisDoEspaco(last);
                const lower = firstWord.toLowerCase();
                const lowerKeywords = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);
                if (lowerKeywords.some((kw) => lower.includes(kw))) {
                    finalResults = [...results, firstWord];
                }
            }
            self.postMessage({ id, results: finalResults, carry: '', linesProcessed, done: true });
        } else {
            self.postMessage({ id, results: finalResults, carry: newCarry, linesProcessed, done: false });
        }
    }
};