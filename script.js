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

function filtrarPalavras() {
    const inputKeywords = document.getElementById('inputKeywords').value.trim().split('\n');
    const files = document.getElementById('folderPicker').files;
    const result = document.getElementById('result');
    const notification = document.getElementById('notification');
    let totalFilteredLines = 0;
    let filteredLines = new Set(); // Usar Set para evitar duplicatas
    let fileCount = 0;

    if (files.length === 0) {
        alert('Por favor, selecione uma pasta.');
        return;
    }

    Array.from(files).forEach(file => {
        if (file.name.toLowerCase().endsWith('.txt')) {
            fileCount++;
            const reader = new FileReader();
            
            reader.onload = function(event) {
                const lines = event.target.result.split('\n');
                const filtered = lines.filter(line => 
                    inputKeywords.some(keyword => line.toLowerCase().includes(keyword.toLowerCase()))
                );
                
                filtered.forEach(line => filteredLines.add(line)); // Adicionar linhas filtradas
                totalFilteredLines += filtered.length;

                // Atualizar o resultado e a notificação
                result.value = Array.from(filteredLines).join('\n');
                notification.textContent = `Linhas filtradas: ${totalFilteredLines}`;
                notification.style.display = 'block';
                
                if (fileCount === files.length) {
                    document.getElementById('downloadBtn').style.display = 'block'; // Mostrar botão de download quando todos os arquivos forem processados
                }
            };
            
            reader.readAsText(file);
        }
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
