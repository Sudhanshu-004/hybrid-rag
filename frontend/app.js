document.addEventListener('DOMContentLoaded', () => {
    // Theme Switcher
    const themeSwitch = document.getElementById('themeSwitch');
    const htmlEl = document.documentElement;
    
    themeSwitch.addEventListener('change', (e) => {
        if(e.target.checked) {
            htmlEl.setAttribute('data-theme', 'dark');
        } else {
            htmlEl.setAttribute('data-theme', 'light');
        }
    });

    // File Upload Handlers
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const welcomeMessage = document.getElementById('welcomeMessage');
    const searchSection = document.getElementById('searchSection');
    const loadedFilesBox = document.getElementById('loadedFilesBox');
    const emptyFilesBox = document.getElementById('emptyFilesBox');
    const loadedFilesList = document.getElementById('loadedFilesList');

    uploadZone.addEventListener('click', () => fileInput.click());

    ['dragover', 'dragenter'].forEach(evt => {
        uploadZone.addEventListener(evt, (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
    });

    ['dragleave', 'dragend', 'drop'].forEach(evt => {
        uploadZone.addEventListener(evt, (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
        });
    });

    uploadZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        handleFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        fileInput.value = ''; // Reset
    });

    async function handleFiles(files) {
        for(let i=0; i<files.length; i++) {
            const file = files[i];
            if(file.type !== 'application/pdf') {
                showStatus(`❌ ${file.name} is not a PDF file.`, 'error');
                continue;
            }
            
            showStatus(`⏳ Uploading and parsing ${file.name}...`, 'info');
            
            const formData = new FormData();
            formData.append('file', file);
            
            try {
                const res = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                
                if(data.success) {
                    showStatus(`✓ Indexed: ${file.name}`, 'success');
                    refreshFiles();
                } else {
                    showStatus(`❌ Error parsing ${file.name}: ${data.detail || 'Unknown error'}`, 'error');
                }
            } catch(e) {
                showStatus(`❌ Network Error uploading ${file.name}`, 'error');
            }
        }
    }

    function showStatus(message, type) {
        uploadStatus.innerHTML = `<div class="info-box" style="margin-top:1rem; border-color: ${type==='error'?'#ef4444':(type==='success'?'#10b981':'#3b82f6')}">${message}</div>`;
        setTimeout(() => { uploadStatus.innerHTML = ''; }, 5000);
    }

    async function refreshFiles() {
        try {
            const res = await fetch('/files');
            const data = await res.json();
            const files = data.files;
            
            if(files.length > 0) {
                welcomeMessage.style.display = 'none';
                searchSection.style.display = 'block';
                emptyFilesBox.style.display = 'none';
                loadedFilesBox.style.display = 'block';
                loadedFilesList.innerHTML = files.map(f => `<li>${f}</li>`).join('');
            } else {
                welcomeMessage.style.display = 'block';
                searchSection.style.display = 'none';
                emptyFilesBox.style.display = 'block';
                loadedFilesBox.style.display = 'none';
                loadedFilesList.innerHTML = '';
            }
        } catch(e) {
            console.error("Could not fetch files", e);
        }
    }

    // Clear Database
    document.getElementById('clearBtn').addEventListener('click', async () => {
        try {
            await fetch('/clear', { method: 'POST' });
            refreshFiles();
            document.getElementById('resultsContainer').innerHTML = '';
            document.getElementById('searchInput').value = '';
        } catch(e) {
            console.error("Error clearing DB", e);
        }
    });

    // Search Handlers
    const searchInput = document.getElementById('searchInput');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultsContainer = document.getElementById('resultsContainer');
    const topKInput = document.getElementById('topK');
    const topKRetrievalInput = document.getElementById('topKRetrieval');
    const resultCardTemplate = document.getElementById('resultCardTemplate');

    let debounceTimer;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performSearch();
        }, 500); // 500ms debounce
    });

    [topKInput, topKRetrievalInput].forEach(el => {
        el.addEventListener('change', () => {
            document.getElementById(el.id + 'Val').textContent = el.value;
            performSearch();
        });
    });

    async function performSearch() {
        const query = searchInput.value.trim();
        if(!query) {
            resultsContainer.innerHTML = '';
            return;
        }

        const topK = topKInput.value;
        const topKRetrieval = topKRetrievalInput.value;

        resultsContainer.innerHTML = '';
        loadingIndicator.style.display = 'flex';

        try {
            const res = await fetch(`/search?query=${encodeURIComponent(query)}&top_k=${topK}&top_k_retrieval=${topKRetrieval}`);
            const results = await res.json();
            
            loadingIndicator.style.display = 'none';
            
            if(results.length === 0) {
                resultsContainer.innerHTML = '<div class="warning-box">No results returned. Try generalising the search parameters or check the parsed text contents.</div>';
                return;
            }

            resultsContainer.innerHTML = `<h3 style="margin-bottom:1rem; font-weight: 500;">Top ${results.length} Contextual Citations</h3>`;
            
            results.forEach(item => {
                const clone = resultCardTemplate.content.cloneNode(true);
                clone.querySelector('.badge-source').textContent = `📄 ${item.metadata.source}`;
                clone.querySelector('.badge-page').textContent = `📖 Page ${item.metadata.page}`;
                clone.querySelector('.badge-score').textContent = `🏆 RRF Score: ${item.rrf_score.toFixed(6)}`;
                clone.querySelector('.card-content').textContent = item.content;
                
                const faissRank = item.faiss_rank !== null ? `#${item.faiss_rank}` : 'N/A';
                const bm25Rank = item.bm25_rank !== null ? `#${item.bm25_rank}` : 'N/A';
                
                clone.querySelector('.meta-rank').innerHTML = `Engine Retrieval Coordinates: FAISS Rank: <strong>${faissRank}</strong> | BM25 Rank: <strong>${bm25Rank}</strong>`;
                
                resultsContainer.appendChild(clone);
            });

        } catch(e) {
            loadingIndicator.style.display = 'none';
            resultsContainer.innerHTML = '<div class="warning-box">Network Error executing search.</div>';
        }
    }

    // Initial check
    refreshFiles();
});
