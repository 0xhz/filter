import { processULPChunk, flushULPCarry } from './ulp-parser.js';

self.onmessage = (e) => {
    const { type, id, chunk, carry, finalize } = e.data;

    if (type === 'process') {
        const { results, carry: newCarry, linesProcessed } = processULPChunk(chunk, carry);
        let finalResults = results;

        if (finalize) {
            finalResults = [...results, ...flushULPCarry(newCarry)];
            self.postMessage({
                id,
                results: finalResults,
                carry: '',
                linesProcessed,
                done: true
            });
        } else {
            self.postMessage({
                id,
                results: finalResults,
                carry: newCarry,
                linesProcessed,
                done: false
            });
        }
    }
};