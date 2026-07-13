import { FileProcessor, getTxtFiles, calcTotalSize } from './processor.js';
import { UIController, getPreviewText, formatBytes, formatTime } from './ui.js';

const ui = new UIController();
let processor = null;
let fullResults = [];

ui.initTheme();

document.getElementById('btnModeEmail').addEventListener('click', () => {
    ui.showScreen('email');
    ui.resetNotification();
});

document.getElementById('btnModeULP').addEventListener('click', () => {
    ui.showScreen('ulp');
    ui.resetNotification();
});

document.getElementById('btnBackEmail').addEventListener('click', () => goBack());
document.getElementById('btnBackULP').addEventListener('click', () => goBack());

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

function setupFileInputs(fileInput, folderInput, infoTarget) {
    const updateInfo = () => {
        const files = getTxtFiles(fileInput.files.length ? fileInput.files : folderInput.files);
        if (files.length === 0) {
            ui.hideFileInfo();
            return;
        }
        const totalSize = calcTotalSize(files);
        const warn = totalSize > 2 * 1024 * 1024 * 1024;
        ui.showFileInfo(
            `${files.length} arquivo(s) .txt — ${formatBytes(totalSize)}` +
            (warn ? ' ⚠ Arquivos muito grandes podem ter limite no navegador. Considere dividir.' : ''),
            warn
        );
    };

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) folderInput.value = '';
        updateInfo();
    });
    folderInput.addEventListener('change', () => {
        if (folderInput.files.length) fileInput.value = '';
        updateInfo();
    });
}

setupFileInputs(
    document.getElementById('emailFilePicker'),
    document.getElementById('emailFolderPicker'),
    'email'
);

setupFileInputs(
    document.getElementById('ulpFilePicker'),
    document.getElementById('ulpFolderPicker'),
    'ulp'
);

document.getElementById('emailFilterBtn').addEventListener('click', () => startProcessing('email'));
document.getElementById('ulpFilterBtn').addEventListener('click', () => startProcessing('ulp'));

document.getElementById('stopBtn').addEventListener('click', () => {
    processor?.pause();
    ui.setProcessingState('paused');
    ui.updateProgress({
        status: '⏸ Pausado — Continue ou Encerre'
    });
});

document.getElementById('resumeBtn').addEventListener('click', async () => {
    ui.setProcessingState('processing');
    await processor?.resume();
});

document.getElementById('cancelBtn').addEventListener('click', () => {
    processor?.cancel();
    processor = null;
    ui.setProcessingState('idle');
    ui.showProgress(false);
    ui.updateProgress({ percent: 0, status: 'Encerrado', stats: '' });
});

document.getElementById('downloadBtn').addEventListener('click', () => downloadResults());

function getSelectedFiles(mode) {
    if (mode === 'email') {
        const fileInput = document.getElementById('emailFilePicker');
        const folderInput = document.getElementById('emailFolderPicker');
        return getTxtFiles(fileInput.files.length ? fileInput.files : folderInput.files);
    }
    const fileInput = document.getElementById('ulpFilePicker');
    const folderInput = document.getElementById('ulpFolderPicker');
    return getTxtFiles(fileInput.files.length ? fileInput.files : folderInput.files);
}

async function startProcessing(mode) {
    const files = getSelectedFiles(mode);

    if (files.length === 0) {
        alert('Selecione um arquivo .txt ou uma pasta com arquivos .txt.');
        return;
    }

    if (mode === 'email') {
        const keywords = document.getElementById('inputKeywords').value.trim().split('\n').filter(Boolean);
        if (keywords.length === 0) {
            alert('Digite pelo menos uma palavra-chave.');
            return;
        }
    }

    if (processor) {
        processor.cancel();
    }

    fullResults = [];
    ui.resetNotification();
    ui.showProgress(true);
    ui.startTimer();
    ui.setProcessingState('processing');

    const actionBtn = mode === 'email'
        ? document.getElementById('emailFilterBtn')
        : document.getElementById('ulpFilterBtn');
    ui.setActionButton(actionBtn);

    const keywords = mode === 'email'
        ? document.getElementById('inputKeywords').value.trim().split('\n').filter(Boolean)
        : [];

    processor = new FileProcessor({
        mode,
        onProgress: (data) => {
            const elapsed = formatTime(ui.getElapsed());
            let status = '';
            if (data.status === 'done') {
                status = '✅ Concluído!';
            } else if (data.fileName) {
                const fileNum = data.fileIndex + 1;
                status = `🔄 Processando ${fileNum}/${data.fileTotal} — ${data.fileName} — ${data.filePercent?.toFixed(0) || 0}%`;
            }
            ui.updateProgress({
                percent: data.percent,
                status,
                stats: `Linhas: ${data.totalLines.toLocaleString()} | Resultado: ${data.resultCount.toLocaleString()} | ${formatBytes(data.bytesProcessed)}/${formatBytes(data.totalBytes)} | ${elapsed}`,
                notification: mode === 'email'
                    ? `Linhas filtradas: ${data.resultCount.toLocaleString()}`
                    : `Credenciais extraídas: ${data.resultCount.toLocaleString()}`
            });
        },
        onResults: (lines, final = false) => {
            fullResults = lines;
            ui.updateResult(getPreviewText(lines), lines.length);
            if (final) {
                ui.setProcessingState('idle');
            }
        },
        onComplete: () => {
            ui.setProcessingState('idle');
        },
        onPaused: () => {
            ui.setProcessingState('paused');
        },
        onError: (err) => {
            alert('Erro: ' + err.message);
            ui.setProcessingState('idle');
        }
    });

    try {
        await processor.start(files, keywords);
    } catch (err) {
        alert(err.message);
        ui.setProcessingState('idle');
        ui.showProgress(false);
    }
}

function downloadResults() {
    const lines = processor?.getResults() || fullResults;
    if (!lines.length) {
        alert('Nenhum resultado para baixar.');
        return;
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = processor?.mode === 'ulp' ? 'ulp_result.txt' : 'result.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}