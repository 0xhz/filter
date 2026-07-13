const PREVIEW_MAX_LINES = 500;

export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

export function getPreviewText(lines, maxLines = PREVIEW_MAX_LINES) {
    if (lines.length <= maxLines) return lines.join('\n');
    const omitted = lines.length - maxLines;
    return `... (${omitted.toLocaleString()} linhas ocultas no preview)\n\n` + lines.slice(-maxLines).join('\n');
}

export class UIController {
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
            actionBtn: null,
            stopBtn: document.getElementById('stopBtn'),
            resumeBtn: document.getElementById('resumeBtn'),
            cancelBtn: document.getElementById('cancelBtn'),
            downloadBtn: document.getElementById('downloadBtn'),
            result: document.getElementById('result'),
            fileInfo: document.getElementById('fileInfo'),
            themeToggle: document.getElementById('themeToggleIcon')
        };
        this.currentActionBtn = null;
        this.startTime = 0;
    }

    showScreen(screen) {
        this.els.modeScreen.classList.toggle('hidden', screen !== 'mode');
        this.els.emailScreen.classList.toggle('hidden', screen !== 'email');
        this.els.ulpScreen.classList.toggle('hidden', screen !== 'ulp');
    }

    setActionButton(btn) {
        this.currentActionBtn = btn;
        this.els.actionBtn = btn;
    }

    showProgress(show) {
        this.els.progressPanel.classList.toggle('hidden', !show);
    }

    setProcessingState(state) {
        const { stopBtn, resumeBtn, cancelBtn } = this.els;
        stopBtn.classList.toggle('hidden', state !== 'processing');
        resumeBtn.classList.toggle('hidden', state !== 'paused');
        cancelBtn.classList.toggle('hidden', state !== 'paused');
        if (this.currentActionBtn) {
            this.currentActionBtn.classList.toggle('hidden', state === 'processing');
        }
    }

    updateProgress({ percent, status, stats, notification }) {
        const pct = Math.min(100, Math.max(0, percent));
        this.els.progressBar.style.width = `${pct}%`;
        this.els.progressPercent.textContent = `${pct.toFixed(1)}%`;
        if (status) this.els.progressStatus.textContent = status;
        if (stats) this.els.progressStats.textContent = stats;
        if (notification) {
            this.els.notification.textContent = notification;
            this.els.notification.style.display = 'block';
        }
    }

    updateResult(previewText, totalLines) {
        this.els.result.value = previewText;
        if (totalLines > 0) {
            this.els.downloadBtn.classList.remove('hidden');
        }
    }

    showFileInfo(text, isWarning = false) {
        this.els.fileInfo.textContent = text;
        this.els.fileInfo.classList.toggle('warning', isWarning);
        this.els.fileInfo.classList.remove('hidden');
    }

    hideFileInfo() {
        this.els.fileInfo.classList.add('hidden');
    }

    resetNotification() {
        this.els.notification.style.display = 'none';
        this.els.notification.textContent = '';
    }

    startTimer() {
        this.startTime = Date.now();
    }

    getElapsed() {
        return Date.now() - this.startTime;
    }

    initTheme() {
        this.els.themeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.contains('light-mode');
            document.body.classList.toggle('light-mode', !isLight);
            document.body.classList.toggle('dark-mode', isLight);
            this.els.themeToggle.classList.toggle('fa-sun', !isLight);
            this.els.themeToggle.classList.toggle('fa-moon', isLight);
        });
    }
}