(function () {
    'use strict';

    const PREVIEW_MAX_LINES = 500;
    const UI_UPDATE_INTERVAL = 500;
    const ULP_URL_PART = '(?:https?:\\/\\/)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}(?:\\/[^\\s:]*)?';
    const ULP_BOUNDARY = '(?=(?:https?:\\/\\/)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}(?:\\/[^\\s:]*)?:|(?<=[0-9])(?=[a-zA-Z][a-zA-Z0-9-]*\\.[a-zA-Z]{2,})|$)';
    const ULP_EMAIL_RE = new RegExp(ULP_URL_PART + ':([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}):(.+?)' + ULP_BOUNDARY, 'g');
    const ULP_LOGIN_RE = new RegExp(ULP_URL_PART + ':([^:@\\s/][^:@\\s]{2,}):(.+?)' + ULP_BOUNDARY, 'g');
    const IS_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const URL_IN_PASSWORD_RE = /\/(?:login|authenticate|auth)|\.(?:com|net|org|gg|games|io)\/|:\/\//;
    const CENSORED_RE = /\*/;
    const MAX_PASSWORD_LEN = 128;
    const GARBAGE_RE = /decryption|decrypt|failed\.?$|error|null|undefined|^\s*n\/a\s*$/i;
    const VALID_LOGIN_RE = /^[a-zA-Z0-9._@+-]+$/;
    const VALID_PASS_RE = /^[a-zA-Z0-9._@+\-*,!?#$%&=\\/]+$/;

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
    }

    function formatTime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        if (h > 0) return h + 'h ' + (m % 60) + 'm ' + (s % 60) + 's';
        if (m > 0) return m + 'm ' + (s % 60) + 's';
        return s + 's';
    }

    function getPreviewText(lines) {
        if (lines.length <= PREVIEW_MAX_LINES) return lines.join('\n');
        const omitted = lines.length - PREVIEW_MAX_LINES;
        return '... (' + omitted.toLocaleString() + ' linhas ocultas no preview)\n\n' + lines.slice(-PREVIEW_MAX_LINES).join('\n');
    }

    function sanitizePart(part) {
        return part
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\x21-\x7E]/g, '')
            .replace(/:/g, '')
            .trim();
    }

    function isValidCredential(login, password) {
        if (!login || !password) return false;
        if (CENSORED_RE.test(login) || CENSORED_RE.test(password)) return false;
        if (password.length > MAX_PASSWORD_LEN) return false;
        if (login.length > 64) return false;
        if (URL_IN_PASSWORD_RE.test(password)) return false;
        if (/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(password)) return false;
        if (GARBAGE_RE.test(login) || GARBAGE_RE.test(password)) return false;
        if (!VALID_LOGIN_RE.test(login) || !VALID_PASS_RE.test(password)) return false;
        if (login.includes('..') || password.includes('..')) return false;

        const isEmail = login.includes('@');
        if (isEmail) {
            return login.length >= 5 && IS_EMAIL_RE.test(login);
        }
        if (login.length < 3) return false;
        if (login.includes('/') || /\.(com|net|org|gg|games|io)$/i.test(login)) return false;
        return true;
    }

    function formatCredential(login, password) {
        if (CENSORED_RE.test(login) || CENSORED_RE.test(password)) return null;
        login = sanitizePart(login);
        password = sanitizePart(password);
        if (CENSORED_RE.test(login) || CENSORED_RE.test(password)) return null;
        if (!isValidCredential(login, password)) return null;
        return login + ':' + password;
    }

    function loginMatchesType(login, credentialType) {
        const isEmail = IS_EMAIL_RE.test(login);
        if (credentialType === 'email') return isEmail;
        if (credentialType === 'login') return !isEmail;
        return true;
    }

    function extractULPMatches(text, regex, credentialType, loginFilter) {
        const results = [];
        const re = new RegExp(regex.source, regex.flags);
        let match;
        while ((match = re.exec(text)) !== null) {
            const login = match[1];
            const password = match[2].trim();
            if (loginFilter && !loginFilter(login)) continue;
            if (!loginMatchesType(login, credentialType)) continue;
            const formatted = formatCredential(login, password);
            if (formatted) results.push(formatted);
        }
        return results;
    }

    function isPlainCredentialCandidate(text) {
        const colons = (text.match(/:/g) || []).length;
        if (colons !== 1) return false;
        if (/\.(com|net|org|gg|games|io)\//i.test(text)) return false;
        if (/https?:\/\//i.test(text)) return false;
        return true;
    }

    function parsePlainCredential(text, credentialType) {
        const idx = text.indexOf(':');
        if (idx <= 0) return [];
        const login = text.slice(0, idx);
        const password = text.slice(idx + 1);
        if (!loginMatchesType(login, credentialType)) return [];
        const formatted = formatCredential(login, password);
        return formatted ? [formatted] : [];
    }

    function parseULPLine(text, credentialType) {
        credentialType = credentialType || 'both';
        const seen = new Set();
        const results = [];

        function addLines(lines) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!seen.has(line)) {
                    seen.add(line);
                    results.push(line);
                }
            }
        }

        if (credentialType === 'email' || credentialType === 'both') {
            addLines(extractULPMatches(text, ULP_EMAIL_RE, credentialType));
        }
        if (credentialType === 'login' || credentialType === 'both') {
            addLines(extractULPMatches(text, ULP_LOGIN_RE, credentialType, function (login) {
                return !IS_EMAIL_RE.test(login);
            }));
        }
        if (isPlainCredentialCandidate(text)) {
            addLines(parsePlainCredential(text, credentialType));
        }
        return results;
    }

    function getLowerKeywords(keywords) {
        return keywords.map(function (k) { return k.toLowerCase().trim(); }).filter(Boolean);
    }

    function lineMatchesKeywords(line, lowerKeywords) {
        const lower = line.toLowerCase();
        for (let i = 0; i < lowerKeywords.length; i++) {
            if (lower.includes(lowerKeywords[i])) return true;
        }
        return false;
    }

    function processULPChunk(chunk, carry, keywords, credentialType) {
        carry = carry || '';
        keywords = keywords || [];
        credentialType = credentialType || 'both';
        const lowerKeywords = getLowerKeywords(keywords);
        const combined = carry + chunk;
        const lines = combined.split('\n');
        const newCarry = lines.pop() || '';
        const results = [];
        let linesProcessed = 0;
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed) continue;
            linesProcessed++;
            if (lineMatchesKeywords(trimmed, lowerKeywords)) {
                const parsed = parseULPLine(trimmed, credentialType);
                for (let j = 0; j < parsed.length; j++) {
                    results.push(parsed[j]);
                }
            }
        }
        return { results: results, carry: newCarry, linesProcessed: linesProcessed };
    }

    function flushULPCarry(carry, keywords, credentialType) {
        const trimmed = (carry || '').trim();
        if (!trimmed) return [];
        const lowerKeywords = getLowerKeywords(keywords || []);
        if (!lineMatchesKeywords(trimmed, lowerKeywords)) return [];
        return parseULPLine(trimmed, credentialType || 'both');
    }

    function removerTextoDepoisDoEspaco(linha) {
        return linha.split(' ')[0];
    }

    function processEmailChunk(chunk, carry, keywords) {
        carry = carry || '';
        const combined = carry + chunk;
        const lines = combined.split('\n');
        const newCarry = lines.pop() || '';
        const results = [];
        let linesProcessed = 0;
        const lowerKeywords = keywords.map(function (k) { return k.toLowerCase().trim(); }).filter(Boolean);

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            linesProcessed++;
            const firstWord = removerTextoDepoisDoEspaco(trimmed);
            const lower = firstWord.toLowerCase();
            if (lowerKeywords.some(function (kw) { return lower.includes(kw); })) {
                results.push(firstWord);
            }
        }
        return { results: results, carry: newCarry, linesProcessed: linesProcessed };
    }

    function flushEmailCarry(carry, keywords) {
        const trimmed = (carry || '').trim();
        if (!trimmed) return [];
        const firstWord = removerTextoDepoisDoEspaco(trimmed);
        const lower = firstWord.toLowerCase();
        const lowerKeywords = keywords.map(function (k) { return k.toLowerCase().trim(); }).filter(Boolean);
        if (lowerKeywords.some(function (kw) { return lower.includes(kw); })) return [firstWord];
        return [];
    }

    function getTxtFiles(fileList) {
        return Array.from(fileList).filter(function (f) { return f.name.toLowerCase().endsWith('.txt'); });
    }

    function calcTotalSize(files) {
        return files.reduce(function (sum, f) { return sum + f.size; }, 0);
    }

    function yieldToMain() {
        return new Promise(function (r) { setTimeout(r, 0); });
    }

    class FileProcessor {
        constructor(opts) {
            this.mode = opts.mode;
            this.onProgress = opts.onProgress;
            this.onResults = opts.onResults;
            this.onComplete = opts.onComplete;
            this.onPaused = opts.onPaused;
            this.onError = opts.onError;
            this.state = 'idle';
            this.paused = false;
            this.cancelled = false;
            this.files = [];
            this.fileIndex = 0;
            this.keywords = [];
            this.credentialType = 'both';
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

        async start(files, keywords, credentialType) {
            keywords = keywords || [];
            this.files = files.filter(function (f) { return f.name.toLowerCase().endsWith('.txt'); });
            if (this.files.length === 0) throw new Error('Nenhum arquivo .txt encontrado.');

            this.keywords = keywords;
            this.credentialType = credentialType || 'both';
            this.totalBytes = this.files.reduce(function (s, f) { return s + f.size; }, 0);
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
                if (this.onPaused) this.onPaused();
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
            if (this.reader) this.reader.cancel().catch(function () {});
        }

        addResults(newResults) {
            for (const line of newResults) {
                if (!this.resultSet.has(line)) {
                    this.resultSet.add(line);
                    this.resultLines.push(line);
                }
            }
        }

        notifyResults(final) {
            const count = this.resultLines.length;
            this.onResults(count, getPreviewText(this.resultLines), final);
        }

        processChunk(text, finalize) {
            if (this.mode === 'ulp') {
                const r = processULPChunk(text, this.lineCarry, this.keywords, this.credentialType);
                this.lineCarry = r.carry;
                let allResults = r.results;
                if (finalize) {
                    allResults = r.results.concat(flushULPCarry(this.lineCarry, this.keywords, this.credentialType));
                    this.lineCarry = '';
                }
                return { results: allResults, linesProcessed: r.linesProcessed };
            }
            const r = processEmailChunk(text, this.lineCarry, this.keywords);
            this.lineCarry = r.carry;
            let allResults = r.results;
            if (finalize) {
                allResults = r.results.concat(flushEmailCarry(this.lineCarry, this.keywords));
                this.lineCarry = '';
            }
            return { results: allResults, linesProcessed: r.linesProcessed };
        }

        scheduleUIUpdate(file, filePercent) {
            const now = Date.now();
            if (now - this.lastUIUpdate < UI_UPDATE_INTERVAL) return;
            this.lastUIUpdate = now;
            const globalPercent = this.totalBytes > 0
                ? ((this.bytesProcessed + this.bytesReadCurrentFile) / this.totalBytes) * 100 : 0;
            this.onProgress({
                percent: globalPercent,
                fileIndex: this.fileIndex,
                fileTotal: this.files.length,
                fileName: file.name,
                filePercent: filePercent,
                totalLines: this.totalLines,
                resultCount: this.resultLines.length,
                bytesProcessed: this.bytesProcessed + this.bytesReadCurrentFile,
                totalBytes: this.totalBytes
            });
            this.notifyResults(false);
        }

        async readFileStream(file) {
            const stream = file.stream();
            this.reader = stream.getReader();
            const decoder = new TextDecoder('utf-8', { fatal: false });
            let fileBytesRead = 0;

            while (true) {
                if (this.cancelled) return false;
                if (this.paused) { if (this.onPaused) this.onPaused(); return false; }

                const chunk = await this.reader.read();
                if (this.cancelled) return false;
                if (this.paused) { if (this.onPaused) this.onPaused(); return false; }

                if (chunk.done) {
                    const final = this.processChunk('', true);
                    this.totalLines += final.linesProcessed;
                    this.addResults(final.results);
                    this.bytesReadCurrentFile = file.size;
                    this.scheduleUIUpdate(file, 100);
                    return true;
                }

                fileBytesRead += chunk.value.byteLength;
                this.bytesReadCurrentFile = fileBytesRead;
                const text = decoder.decode(chunk.value, { stream: true });
                const result = this.processChunk(text, false);
                this.totalLines += result.linesProcessed;
                this.addResults(result.results);
                this.scheduleUIUpdate(file, file.size > 0 ? (fileBytesRead / file.size) * 100 : 0);

                this.chunksSinceYield++;
                if (this.chunksSinceYield >= 2) {
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
                    if (this.bytesReadCurrentFile === 0) this.lineCarry = '';

                    this.onProgress({
                        percent: this.totalBytes > 0 ? ((this.bytesProcessed + this.bytesReadCurrentFile) / this.totalBytes) * 100 : 0,
                        fileIndex: this.fileIndex,
                        fileTotal: this.files.length,
                        fileName: file.name,
                        filePercent: this.bytesReadCurrentFile === 0 ? 0 : (this.bytesReadCurrentFile / file.size) * 100,
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
                this.notifyResults(true);
                if (this.onComplete) this.onComplete(this.resultLines);
            } catch (err) {
                if (!this.cancelled && this.onError) this.onError(err);
            }
        }

        getResults() { return this.resultLines; }
    }

    class UIController {
        constructor() {
            this.els = {
                modeScreen: document.getElementById('modeScreen'),
                emailScreen: document.getElementById('emailScreen'),
                ulpScreen: document.getElementById('ulpScreen'),
                progressPanel: document.getElementById('progressPanel'),
                progressBar: document.getElementById('progressBar'),
                progressPercent: document.getElementById('progressPercent'),
                progressStatus: document.getElementById('progressStatus'),
                progressStats: document.getElementById('progressStats'),
                notification: document.getElementById('notification'),
                stopBtn: document.getElementById('stopBtn'),
                resumeBtn: document.getElementById('resumeBtn'),
                cancelBtn: document.getElementById('cancelBtn'),
                downloadBtn: document.getElementById('downloadBtn'),
                ulpDownloadBtn: document.getElementById('ulpDownloadBtn'),
                result: document.getElementById('result'),
                fileInfo: document.getElementById('fileInfo'),
                ulpFileInfo: document.getElementById('ulpFileInfo'),
                themeToggle: document.getElementById('themeToggleIcon')
            };
            this.currentActionBtn = null;
            this.currentMode = null;
            this.startTime = 0;
        }

        showScreen(screen) {
            this.els.modeScreen.classList.toggle('hidden', screen !== 'mode');
            this.els.emailScreen.classList.toggle('hidden', screen !== 'email');
            this.els.ulpScreen.classList.toggle('hidden', screen !== 'ulp');
        }

        setActionButton(btn, mode) {
            this.currentActionBtn = btn;
            this.currentMode = mode;
        }

        showProgress(show) {
            this.els.progressPanel.classList.toggle('hidden', !show);
        }

        setProcessingState(state) {
            this.els.stopBtn.classList.toggle('hidden', state !== 'processing');
            this.els.resumeBtn.classList.toggle('hidden', state !== 'paused');
            this.els.cancelBtn.classList.toggle('hidden', state !== 'paused');
            if (this.currentActionBtn) {
                this.currentActionBtn.classList.toggle('hidden', state === 'processing');
            }
        }

        updateProgress(data) {
            const pct = Math.min(100, Math.max(0, data.percent || 0));
            this.els.progressBar.style.width = pct + '%';
            this.els.progressPercent.textContent = pct.toFixed(1) + '%';
            if (data.status) this.els.progressStatus.textContent = data.status;
            if (data.stats) this.els.progressStats.textContent = data.stats;
            if (data.notification) {
                this.els.notification.textContent = data.notification;
                this.els.notification.style.display = 'block';
            }
        }

        updateResult(previewText, totalLines) {
            this.els.result.value = previewText;
            if (totalLines > 0) {
                if (this.currentMode === 'ulp') {
                    this.els.ulpDownloadBtn.classList.remove('hidden');
                } else {
                    this.els.downloadBtn.classList.remove('hidden');
                }
            }
        }

        showFileInfo(el, text, isWarning) {
            el.textContent = text;
            el.classList.toggle('warning', !!isWarning);
            el.classList.remove('hidden');
        }

        hideFileInfo(el) {
            el.classList.add('hidden');
        }

        resetNotification() {
            this.els.notification.style.display = 'none';
            this.els.notification.textContent = '';
        }

        startTimer() { this.startTime = Date.now(); }
        getElapsed() { return Date.now() - this.startTime; }

        initTheme() {
            this.els.themeToggle.addEventListener('click', function () {
                const isLight = document.body.classList.contains('light-mode');
                document.body.classList.toggle('light-mode', !isLight);
                document.body.classList.toggle('dark-mode', isLight);
                document.getElementById('themeToggleIcon').classList.toggle('fa-sun', !isLight);
                document.getElementById('themeToggleIcon').classList.toggle('fa-moon', isLight);
            });
        }
    }

    const ui = new UIController();
    let processor = null;
    let fullResults = [];

    ui.initTheme();

    document.getElementById('btnModeEmail').addEventListener('click', function () {
        ui.showScreen('email');
        ui.resetNotification();
    });

    document.getElementById('btnModeULP').addEventListener('click', function () {
        ui.showScreen('ulp');
        ui.resetNotification();
    });

    function goBack() {
        if (processor && (processor.state === 'processing' || processor.state === 'paused')) {
            if (!confirm('Processamento em andamento. Deseja encerrar e voltar?')) return;
            processor.cancel();
            processor = null;
        }
        ui.showScreen('mode');
        ui.showProgress(false);
        ui.setProcessingState('idle');
    }

    document.getElementById('btnBackEmail').addEventListener('click', goBack);
    document.getElementById('btnBackULP').addEventListener('click', goBack);

    function setupFileInputs(fileInput, folderInput, infoEl) {
        function updateInfo() {
            const files = getTxtFiles(fileInput.files.length ? fileInput.files : folderInput.files);
            if (files.length === 0) { ui.hideFileInfo(infoEl); return; }
            const totalSize = calcTotalSize(files);
            const warn = totalSize > 2 * 1024 * 1024 * 1024;
            ui.showFileInfo(infoEl,
                files.length + ' arquivo(s) .txt — ' + formatBytes(totalSize) +
                (warn ? ' ⚠ Arquivos muito grandes podem ter limite no navegador. Considere dividir.' : ''),
                warn
            );
        }
        fileInput.addEventListener('change', function () {
            if (fileInput.files.length) folderInput.value = '';
            updateInfo();
        });
        folderInput.addEventListener('change', function () {
            if (folderInput.files.length) fileInput.value = '';
            updateInfo();
        });
    }

    setupFileInputs(
        document.getElementById('emailFilePicker'),
        document.getElementById('emailFolderPicker'),
        ui.els.fileInfo
    );
    setupFileInputs(
        document.getElementById('ulpFilePicker'),
        document.getElementById('ulpFolderPicker'),
        ui.els.ulpFileInfo
    );

    document.querySelectorAll('.credential-option input').forEach(function (input) {
        input.addEventListener('change', function () {
            document.querySelectorAll('.credential-option').forEach(function (el) {
                el.classList.remove('active');
            });
            input.closest('.credential-option').classList.add('active');
        });
    });

    function getSelectedCredentialType() {
        const selected = document.querySelector('input[name="ulpCredentialType"]:checked');
        return selected ? selected.value : 'both';
    }

    document.getElementById('emailFilterBtn').addEventListener('click', function () { startProcessing('email'); });
    document.getElementById('ulpFilterBtn').addEventListener('click', function () { startProcessing('ulp'); });

    document.getElementById('stopBtn').addEventListener('click', function () {
        if (processor) processor.pause();
        ui.setProcessingState('paused');
        ui.updateProgress({ status: '⏸ Pausado — Continue ou Encerre' });
    });

    document.getElementById('resumeBtn').addEventListener('click', async function () {
        ui.setProcessingState('processing');
        if (processor) await processor.resume();
    });

    document.getElementById('cancelBtn').addEventListener('click', function () {
        if (processor) processor.cancel();
        processor = null;
        ui.setProcessingState('idle');
        ui.showProgress(false);
        ui.updateProgress({ percent: 0, status: 'Encerrado', stats: '' });
    });

    document.getElementById('downloadBtn').addEventListener('click', downloadResults);
    document.getElementById('ulpDownloadBtn').addEventListener('click', downloadResults);

    function getSelectedFiles(mode) {
        if (mode === 'email') {
            const fi = document.getElementById('emailFilePicker');
            const fo = document.getElementById('emailFolderPicker');
            return getTxtFiles(fi.files.length ? fi.files : fo.files);
        }
        const fi = document.getElementById('ulpFilePicker');
        const fo = document.getElementById('ulpFolderPicker');
        return getTxtFiles(fi.files.length ? fi.files : fo.files);
    }

    async function startProcessing(mode) {
        const files = getSelectedFiles(mode);
        if (files.length === 0) {
            alert('Selecione um arquivo .txt ou uma pasta com arquivos .txt.');
            return;
        }

        const keywordField = mode === 'email' ? 'inputKeywords' : 'ulpKeywords';
        const keywords = document.getElementById(keywordField).value.trim().split('\n').filter(Boolean);
        if (keywords.length === 0) {
            alert('Digite pelo menos uma palavra-chave.');
            return;
        }

        if (processor) processor.cancel();

        fullResults = [];
        ui.resetNotification();
        ui.showProgress(true);
        ui.startTimer();
        ui.setProcessingState('processing');

        const actionBtn = mode === 'email'
            ? document.getElementById('emailFilterBtn')
            : document.getElementById('ulpFilterBtn');
        ui.setActionButton(actionBtn, mode);

        processor = new FileProcessor({
            mode: mode,
            onProgress: function (data) {
                const elapsed = formatTime(ui.getElapsed());
                let status = '';
                if (data.status === 'done') {
                    status = '✅ Concluído!';
                } else if (data.fileName) {
                    status = '🔄 Processando ' + (data.fileIndex + 1) + '/' + data.fileTotal +
                        ' — ' + data.fileName + ' — ' + (data.filePercent || 0).toFixed(0) + '%';
                }
                ui.updateProgress({
                    percent: data.percent,
                    status: status,
                    stats: 'Linhas: ' + data.totalLines.toLocaleString() +
                        ' | Resultado: ' + data.resultCount.toLocaleString() +
                        ' | ' + formatBytes(data.bytesProcessed) + '/' + formatBytes(data.totalBytes) +
                        ' | ' + elapsed,
                    notification: mode === 'email'
                        ? 'Linhas filtradas: ' + data.resultCount.toLocaleString()
                        : 'Credenciais com palavra-chave: ' + data.resultCount.toLocaleString()
                });
            },
            onResults: function (count, previewText, final) {
                ui.updateResult(previewText, count);
                if (final) {
                    fullResults = processor ? processor.getResults() : [];
                    ui.setProcessingState('idle');
                }
            },
            onComplete: function () { ui.setProcessingState('idle'); },
            onPaused: function () { ui.setProcessingState('paused'); },
            onError: function (err) {
                alert('Erro: ' + err.message);
                ui.setProcessingState('idle');
            }
        });

        try {
            const credentialType = mode === 'ulp' ? getSelectedCredentialType() : 'both';
            await processor.start(files, keywords, credentialType);
        } catch (err) {
            alert(err.message);
            ui.setProcessingState('idle');
            ui.showProgress(false);
        }
    }

    function downloadResults() {
        const lines = (processor && processor.getResults()) || fullResults;
        if (!lines.length) {
            alert('Nenhum resultado para baixar.');
            return;
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (processor && processor.mode === 'ulp') ? 'ulp_result.txt' : 'result.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
})();