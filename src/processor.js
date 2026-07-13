import { processULPChunk, flushULPCarry } from './ulp-parser.js';
import { processEmailChunk, flushEmailCarry } from './email-parser.js';

const UI_UPDATE_INTERVAL = 200;

function yieldToMain() {
    return new Promise((r) => setTimeout(r, 0));
}

export class FileProcessor {
    constructor({ mode, onProgress, onResults, onComplete, onPaused, onError }) {
        this.mode = mode;
        this.onProgress = onProgress;
        this.onResults = onResults;
        this.onComplete = onComplete;
        this.onPaused = onPaused;
        this.onError = onError;

        this.state = 'idle';
        this.paused = false;
        this.cancelled = false;

        this.files = [];
        this.fileIndex = 0;
        this.keywords = [];
        this.reader = null;
        this.lineCarry = '';
        this.bytesReadCurrentFile = 0;
        this.totalBytes = 0;
        this.bytesProcessed = 0;
        this.totalLines = 0;
        this.resultLines = [];
        this.resultSet = new Set();
        this.lastUIUpdate = 0;
        this.chunksSinceYield = 0;
    }

    async start(files, keywords = []) {
        this.files = files.filter((f) => f.name.toLowerCase().endsWith('.txt'));
        if (this.files.length === 0) {
            throw new Error('Nenhum arquivo .txt encontrado.');
        }

        this.keywords = keywords;
        this.totalBytes = this.files.reduce((sum, f) => sum + f.size, 0);
        this.fileIndex = 0;
        this.bytesProcessed = 0;
        this.bytesReadCurrentFile = 0;
        this.lineCarry = '';
        this.totalLines = 0;
        this.resultLines = [];
        this.resultSet = new Set();
        this.state = 'processing';
        this.paused = false;
        this.cancelled = false;

        await this.processLoop();
    }

    pause() {
        if (this.state === 'processing') {
            this.paused = true;
            this.state = 'paused';
            this.onPaused?.();
        }
    }

    async resume() {
        if (this.state === 'paused') {
            this.paused = false;
            this.state = 'processing';
            await this.processLoop();
        }
    }

    cancel() {
        this.cancelled = true;
        this.paused = false;
        this.state = 'idle';
        this.reader?.cancel().catch(() => {});
    }

    addResults(newResults) {
        for (const line of newResults) {
            if (!this.resultSet.has(line)) {
                this.resultSet.add(line);
                this.resultLines.push(line);
            }
        }
    }

    processChunk(text, finalize) {
        if (this.mode === 'ulp') {
            const { results, carry, linesProcessed } = processULPChunk(text, this.lineCarry);
            this.lineCarry = carry;
            let allResults = results;
            let extraLines = linesProcessed;
            if (finalize) {
                allResults = [...results, ...flushULPCarry(this.lineCarry)];
                this.lineCarry = '';
            }
            return { results: allResults, linesProcessed: extraLines };
        }

        const { results, carry, linesProcessed } = processEmailChunk(text, this.lineCarry, this.keywords);
        this.lineCarry = carry;
        let allResults = results;
        let extraLines = linesProcessed;
        if (finalize) {
            allResults = [...results, ...flushEmailCarry(this.lineCarry, this.keywords)];
            this.lineCarry = '';
        }
        return { results: allResults, linesProcessed: extraLines };
    }

    scheduleUIUpdate(file, filePercent) {
        const now = Date.now();
        if (now - this.lastUIUpdate < UI_UPDATE_INTERVAL) return;

        this.lastUIUpdate = now;
        const globalPercent = this.totalBytes > 0
            ? ((this.bytesProcessed + this.bytesReadCurrentFile) / this.totalBytes) * 100
            : 0;

        this.onProgress({
            percent: globalPercent,
            fileIndex: this.fileIndex,
            fileTotal: this.files.length,
            fileName: file.name,
            filePercent,
            totalLines: this.totalLines,
            resultCount: this.resultLines.length,
            bytesProcessed: this.bytesProcessed + this.bytesReadCurrentFile,
            totalBytes: this.totalBytes
        });

        this.onResults([...this.resultLines]);
    }

    async readFileStream(file) {
        const stream = file.stream();
        this.reader = stream.getReader();
        const decoder = new TextDecoder('utf-8', { fatal: false });
        let fileBytesRead = 0;

        while (true) {
            if (this.cancelled) return false;
            if (this.paused) {
                this.onPaused?.();
                return false;
            }

            const { done, value } = await this.reader.read();

            if (this.cancelled) return false;
            if (this.paused) {
                this.onPaused?.();
                return false;
            }

            if (done) {
                const final = this.processChunk('', true);
                this.totalLines += final.linesProcessed;
                this.addResults(final.results);
                this.bytesReadCurrentFile = file.size;
                this.scheduleUIUpdate(file, 100);
                return true;
            }

            fileBytesRead += value.byteLength;
            this.bytesReadCurrentFile = fileBytesRead;

            const text = decoder.decode(value, { stream: true });
            const result = this.processChunk(text, false);
            this.totalLines += result.linesProcessed;
            this.addResults(result.results);

            const filePercent = file.size > 0 ? (fileBytesRead / file.size) * 100 : 0;
            this.scheduleUIUpdate(file, filePercent);

            this.chunksSinceYield++;
            if (this.chunksSinceYield >= 4) {
                this.chunksSinceYield = 0;
                await yieldToMain();
            }
        }
    }

    async processLoop() {
        try {
            while (this.fileIndex < this.files.length) {
                if (this.cancelled) return;

                const file = this.files[this.fileIndex];
                const isNewFile = this.bytesReadCurrentFile === 0;

                if (isNewFile) {
                    this.lineCarry = '';
                }

                this.onProgress({
                    percent: this.totalBytes > 0
                        ? ((this.bytesProcessed + this.bytesReadCurrentFile) / this.totalBytes) * 100
                        : 0,
                    fileIndex: this.fileIndex,
                    fileTotal: this.files.length,
                    fileName: file.name,
                    filePercent: isNewFile ? 0 : (this.bytesReadCurrentFile / file.size) * 100,
                    totalLines: this.totalLines,
                    resultCount: this.resultLines.length,
                    bytesProcessed: this.bytesProcessed + this.bytesReadCurrentFile,
                    totalBytes: this.totalBytes,
                    status: 'starting'
                });

                const completed = await this.readFileStream(file);
                if (!completed) return;

                this.bytesProcessed += file.size;
                this.bytesReadCurrentFile = 0;
                this.fileIndex++;
            }

            this.state = 'complete';
            this.onProgress({
                percent: 100,
                fileIndex: this.files.length,
                fileTotal: this.files.length,
                fileName: '',
                filePercent: 100,
                totalLines: this.totalLines,
                resultCount: this.resultLines.length,
                bytesProcessed: this.totalBytes,
                totalBytes: this.totalBytes,
                status: 'done'
            });
            this.onResults([...this.resultLines], true);
            this.onComplete?.(this.resultLines);
        } catch (err) {
            if (!this.cancelled) {
                this.onError?.(err);
            }
        }
    }

    getResults() {
        return this.resultLines;
    }
}

export function getTxtFiles(fileList) {
    return Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith('.txt'));
}

export function calcTotalSize(files) {
    return files.reduce((sum, f) => sum + f.size, 0);
}