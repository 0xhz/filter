document.getElementById('themeToggleIcon').addEventListener('click', function() {
    const isLightMode = document.body.classList.contains('light-mode');
    if (isLightMode) {
        document.body.classList.remove('light-mode');
        document.body.classList.add('dark-mode');
        document.getElementById('themeToggleIcon').classList.remove('fa-sun');
        document.getElementById('themeToggleIcon').classList.add('fa-moon');
    } else {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
        document.getElementById('themeToggleIcon').classList.remove('fa-moon');
        document.getElementById('themeToggleIcon').classList.add('fa-sun');
    }
});

function removerTextoDepoisDoEspaco(linha) {
    return linha.split(' ')[0];
}

function filtrarPalavras() {
    const inputKeywords = document.getElementById('inputKeywords').value.trim().split('\n');
    const files = document.getElementById('folderPicker').files;
    const result = document.getElementById('result');
    const notification = document.getElementById('notification');
    let totalFilteredLines = 0;
    let filteredLines = new Set();
    let fileCount = 0;
    let validFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.txt'));

    if (validFiles.length === 0) {
        alert('Por favor, selecione uma pasta contendo apenas arquivos .txt.');
        return;
    }

    validFiles.forEach(file => {
        fileCount++;
        const reader = new FileReader();
        
        reader.onload = function(event) {
            const lines = event.target.result.split('\n').map(line => removerTextoDepoisDoEspaco(line));
            const filtered = lines.filter(line => 
                inputKeywords.some(keyword => line.toLowerCase().includes(keyword.toLowerCase()))
            );
            
            filtered.forEach(line => filteredLines.add(line));
            totalFilteredLines += filtered.length;

            result.value = Array.from(filteredLines).join('\n');
            notification.textContent = `Linhas filtradas: ${totalFilteredLines}`;
            notification.style.display = 'block';
            
            if (fileCount === validFiles.length) {
                document.getElementById('downloadBtn').style.display = 'block';
            }
        };
        
        reader.readAsText(file);
    });
}

function baixarResultado() {
    const result = document.getElementById('result').value;
    const blob = new Blob([result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'result.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
