document.addEventListener('DOMContentLoaded', () => {

    /* ══════════════════════════════════════════════════
       THEME SWITCHER
       ══════════════════════════════════════════════════ */
    const themeSwitch = document.getElementById('themeSwitch');
    const htmlEl = document.documentElement;

    themeSwitch.addEventListener('change', (e) => {
        htmlEl.setAttribute('data-theme', e.target.checked ? 'dark' : 'light');
    });

    /* ══════════════════════════════════════════════════
       MODE SWITCHER — Chat / Developer
       ══════════════════════════════════════════════════ */
    const modeBtnChat = document.getElementById('modeBtnChat');
    const modeBtnDev = document.getElementById('modeBtnDev');
    const modeIndicator = document.getElementById('modeIndicator');
    const chatView = document.getElementById('chatView');
    const devView = document.getElementById('devView');
    const tunerSection = document.getElementById('tunerSection');

    let currentMode = localStorage.getItem('ragMode') || 'chat';

    function setMode(mode) {
        currentMode = mode;
        localStorage.setItem('ragMode', mode);

        if (mode === 'chat') {
            modeBtnChat.classList.add('active');
            modeBtnDev.classList.remove('active');
            modeIndicator.classList.remove('right');
            chatView.classList.add('active');
            devView.classList.remove('active');
            tunerSection.classList.add('hidden');
        } else {
            modeBtnDev.classList.add('active');
            modeBtnChat.classList.remove('active');
            modeIndicator.classList.add('right');
            devView.classList.add('active');
            chatView.classList.remove('active');
            tunerSection.classList.remove('hidden');
        }
    }

    modeBtnChat.addEventListener('click', () => setMode('chat'));
    modeBtnDev.addEventListener('click', () => setMode('dev'));
    setMode(currentMode);

    /* ══════════════════════════════════════════════════
       FILE UPLOAD HANDLERS
       ══════════════════════════════════════════════════ */
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
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        fileInput.value = '';
    });

    async function handleFiles(files) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type !== 'application/pdf') {
                showStatus(`❌ ${file.name} is not a PDF file.`, 'error');
                continue;
            }

            showStatus(`⏳ Uploading and parsing ${file.name}...`, 'info');

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch('/upload', { method: 'POST', body: formData });
                const data = await res.json();

                if (data.success) {
                    showStatus(`✓ Indexed: ${file.name}`, 'success');
                    refreshFiles();
                } else {
                    showStatus(`❌ Error parsing ${file.name}: ${data.detail || 'Unknown error'}`, 'error');
                }
            } catch (e) {
                showStatus(`❌ Network Error uploading ${file.name}`, 'error');
            }
        }
    }

    function showStatus(message, type) {
        const colors = { error: '#ef4444', success: '#10b981', info: '#6366f1' };
        uploadStatus.innerHTML = `<div class="info-box" style="border-color: ${colors[type] || colors.info}">${message}</div>`;
        setTimeout(() => { uploadStatus.innerHTML = ''; }, 5000);
    }

    async function refreshFiles() {
        try {
            const res = await fetch('/files');
            const data = await res.json();
            const files = data.files;

            if (files.length > 0) {
                if (welcomeMessage) welcomeMessage.style.display = 'none';
                if (searchSection) searchSection.style.display = 'block';
                emptyFilesBox.style.display = 'none';
                loadedFilesBox.style.display = 'block';
                loadedFilesList.innerHTML = files.map(f => `<li>${f}</li>`).join('');
                // Update chat welcome to hide when files are loaded
                const chatWelcome = document.querySelector('.chat-welcome');
                if (chatWelcome && files.length > 0) {
                    chatWelcome.querySelector('p').textContent = `${files.length} document(s) loaded. Ask me anything about them!`;
                }
            } else {
                if (welcomeMessage) welcomeMessage.style.display = 'block';
                if (searchSection) searchSection.style.display = 'none';
                emptyFilesBox.style.display = 'block';
                loadedFilesBox.style.display = 'none';
                loadedFilesList.innerHTML = '';
            }
            await fetchModelStatus();
        } catch (e) {
            console.error("Could not fetch files", e);
        }
    }

    /* ══════════════════════════════════════════════════
       CLEAR DATABASE
       ══════════════════════════════════════════════════ */
    document.getElementById('clearBtn').addEventListener('click', async () => {
        try {
            await fetch('/clear', { method: 'POST' });
            refreshFiles();
            const resultsContainer = document.getElementById('resultsContainer');
            if (resultsContainer) resultsContainer.innerHTML = '';
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            // Clear chat messages
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.innerHTML = `
                    <div class="chat-welcome">
                        <div class="chat-welcome-icon">🔍</div>
                        <h3>Welcome to RAG Chat</h3>
                        <p>Upload a PDF and ask questions about your documents. I'll find the most relevant answers for you.</p>
                    </div>
                `;
            }
        } catch (e) {
            console.error("Error clearing DB", e);
        }
    });

    /* ══════════════════════════════════════════════════
       DEVELOPER MODE — Search Handlers
       ══════════════════════════════════════════════════ */
    const searchInput = document.getElementById('searchInput');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultsContainer = document.getElementById('resultsContainer');
    const topKInput = document.getElementById('topK');
    const topKRetrievalInput = document.getElementById('topKRetrieval');
    const resultCardTemplate = document.getElementById('resultCardTemplate');

    let debounceTimer;

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                performSearch();
            }, 500);
        });
    }

    [topKInput, topKRetrievalInput].forEach(el => {
        if (el) {
            el.addEventListener('change', () => {
                document.getElementById(el.id + 'Val').textContent = el.value;
                performSearch();
            });
        }
    });

    /* ══════════════════════════════════════════════════
       MODEL MANAGEMENT
       ══════════════════════════════════════════════════ */
    const modelSelect = document.getElementById('modelSelect');
    const fineTunedOpt = document.getElementById('fineTunedOpt');
    const trainBtn = document.getElementById('trainBtn');
    const trainStatus = document.getElementById('trainStatus');
    const activeModelBadge = document.getElementById('activeModelBadge');
    const chatModelBadge = document.getElementById('chatModelBadge');

    async function fetchModelStatus() {
        try {
            const res = await fetch('/model_status');
            const data = await res.json();

            const opt = document.getElementById('fineTunedOpt');
            if (data.fine_tuned_available && opt) {
                opt.disabled = false;
                opt.removeAttribute('disabled');
                opt.textContent = "Fine-Tuned Model (Local Weights)";
            } else if (opt) {
                opt.disabled = true;
                opt.setAttribute('disabled', 'disabled');
                opt.textContent = "Fine-Tuned Model (Not Trained Yet)";
            }

            if (modelSelect && data.active_model_key) {
                modelSelect.value = data.active_model_key;
            }
            if (activeModelBadge && data.active_model_label) {
                activeModelBadge.textContent = `Model: ${data.active_model_label}`;
            }
            if (chatModelBadge && data.active_model_label) {
                chatModelBadge.textContent = `⚡ ${data.active_model_label}`;
            }
        } catch (e) {
            console.error("Could not fetch model status", e);
        }
    }

    modelSelect.addEventListener('change', async (e) => {
        const modelKey = e.target.value;
        try {
            const res = await fetch('/switch_model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_key: modelKey })
            });
            const data = await res.json();
            if (data.success) {
                if (activeModelBadge) activeModelBadge.textContent = `Model: ${data.active_model_label}`;
                if (chatModelBadge) chatModelBadge.textContent = `⚡ ${data.active_model_label}`;
                showStatus(`✓ ${data.message}`, 'success');
                performSearch();
            } else {
                showStatus(`❌ ${data.detail || 'Error switching model'}`, 'error');
                fetchModelStatus();
            }
        } catch (e) {
            showStatus('❌ Network error switching embedding model', 'error');
        }
    });

    /* ══════════════════════════════════════════════════
       FINE-TUNE TRAINING with Progress Bar
       ══════════════════════════════════════════════════ */
    trainBtn.addEventListener('click', async () => {
        trainBtn.disabled = true;
        trainBtn.innerHTML = '<span class="btn-icon">⏳</span> Training...';

        trainStatus.innerHTML = `
            <div class="training-progress-card">
                <div class="progress-header">
                    <span class="progress-title"><span class="pulse-dot"></span> Fine-Tuning Embeddings</span>
                    <span class="progress-percent" id="trainProgressPercent">0%</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" id="trainProgressFill"></div>
                </div>
                <div class="progress-step-text" id="trainStepText">Initializing PyTorch training pipeline...</div>
            </div>
        `;

        let currentPercent = 0;
        const fillEl = document.getElementById('trainProgressFill');
        const percentEl = document.getElementById('trainProgressPercent');
        const stepEl = document.getElementById('trainStepText');

        const steps = [
            { threshold: 20, text: "Extracting synthetic QA training pairs..." },
            { threshold: 45, text: "Optimizing MultipleNegativesRankingLoss..." },
            { threshold: 70, text: "Updating neural weights & saving model..." },
            { threshold: 88, text: "Finalizing embedding checkpoint..." }
        ];

        const progressInterval = setInterval(() => {
            if (currentPercent < 90) {
                currentPercent += Math.floor(Math.random() * 5) + 3;
                if (currentPercent > 90) currentPercent = 90;
                if (fillEl) fillEl.style.width = currentPercent + '%';
                if (percentEl) percentEl.textContent = currentPercent + '%';
                for (const s of steps) {
                    if (currentPercent >= s.threshold && stepEl) {
                        stepEl.textContent = s.text;
                    }
                }
            }
        }, 300);

        try {
            const res = await fetch('/train?epochs=1', { method: 'POST' });
            const data = await res.json();
            clearInterval(progressInterval);

            if (data.success) {
                if (fillEl) fillEl.style.width = '100%';
                if (percentEl) percentEl.textContent = '100%';
                if (stepEl) stepEl.textContent = 'Training Complete! Re-indexing vectors...';

                setTimeout(async () => {
                    trainStatus.innerHTML = `
                        <div class="info-box success-box" style="margin-top:0.5rem;">
                            <strong>✓ Fine-Tuning Complete!</strong><br>
                            ${data.message}
                        </div>
                    `;
                    await fetchModelStatus();
                    performSearch();
                }, 600);
            } else {
                trainStatus.innerHTML = `<div class="warning-box" style="margin-top:0.5rem;">❌ ${data.detail || 'Training failed.'}</div>`;
            }
        } catch (e) {
            clearInterval(progressInterval);
            trainStatus.innerHTML = '<div class="warning-box" style="margin-top:0.5rem;">❌ Network or server error during model fine-tuning.</div>';
        } finally {
            trainBtn.disabled = false;
            trainBtn.innerHTML = '<span class="btn-icon">⚡</span> Fine-Tune on PDFs';
        }
    });

    /* ══════════════════════════════════════════════════
       TEXT UTILITIES (shared by Chat & Developer modes)
       ══════════════════════════════════════════════════ */

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function highlightQueryText(text, query) {
        if (!query || !text) return escapeHtml(text || '');
        const cleanQuery = query.trim();
        if (!cleanQuery) return escapeHtml(text);

        const escapedText = escapeHtml(text);

        // 1. First attempt exact full phrase highlight
        const escapedQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exactPattern = new RegExp(`(${escapedQuery})`, 'gi');

        if (exactPattern.test(escapedText)) {
            return escapedText.replace(exactPattern, '<mark class="highlight-text">$1</mark>');
        }

        // 2. Fallback to individual words
        const words = cleanQuery.split(/\s+/).filter(w => w.length > 2);
        if (words.length === 0) return escapedText;

        const pattern = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
        return escapedText.replace(pattern, '<mark class="highlight-text">$1</mark>');
    }

    function extractKeyAnswerSnippet(text, query) {
        if (!text || !query) return "";
        const cleanQuery = query.toLowerCase().trim();

        // Split text by lines first (ideal for QA documents with Q: and A: lines)
        const lines = text.split(/\r?\n+/).map(l => l.trim()).filter(Boolean);
        let matchIdx = lines.findIndex(l => l.toLowerCase().includes(cleanQuery));

        if (matchIdx !== -1) {
            if (matchIdx < lines.length - 1) {
                const currentLine = lines[matchIdx];
                const nextLine = lines[matchIdx + 1];
                if (currentLine.includes('?') || currentLine.startsWith('Q:') || /^\d+\.\s*Q:/.test(currentLine)) {
                    return `${currentLine}\n${nextLine}`;
                }
            }
            return lines[matchIdx];
        }

        // Sentence fallback
        const sentences = text.split(/(?<=[.!?])\s+/);
        const exactSentenceIdx = sentences.findIndex(s => s.toLowerCase().includes(cleanQuery));
        if (exactSentenceIdx !== -1) {
            if (exactSentenceIdx < sentences.length - 1 && sentences[exactSentenceIdx].includes('?')) {
                return `${sentences[exactSentenceIdx]}\n${sentences[exactSentenceIdx + 1]}`;
            }
            return sentences[exactSentenceIdx];
        }

        return sentences.slice(0, 2).join(" ");
    }

    function stripHtmlTags(text) {
        const tmp = document.createElement('div');
        tmp.innerHTML = text;
        return tmp.textContent || tmp.innerText || '';
    }

    /* ══════════════════════════════════════════════════
       DEVELOPER MODE — performSearch()
       ══════════════════════════════════════════════════ */
    async function performSearch() {
        if (!searchInput) return;
        const query = searchInput.value.trim();
        if (!query) {
            if (resultsContainer) resultsContainer.innerHTML = '';
            return;
        }

        const topK = topKInput ? topKInput.value : 5;
        const topKRetrieval = topKRetrievalInput ? topKRetrievalInput.value : 20;

        if (resultsContainer) resultsContainer.innerHTML = '';
        if (loadingIndicator) loadingIndicator.style.display = 'flex';

        try {
            const res = await fetch(`/search?query=${encodeURIComponent(query)}&top_k=${topK}&top_k_retrieval=${topKRetrieval}`);
            const results = await res.json();

            if (loadingIndicator) loadingIndicator.style.display = 'none';

            if (results.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="warning-box" style="border-color: #ef4444; background: rgba(239, 68, 68, 0.08); color: #ef4444; margin-top: 1rem;">
                        <strong>⚠️ Answer Not Found in Uploaded PDFs</strong><br>
                        No relevant information was found in your uploaded documents matching <em>"${escapeHtml(query)}"</em>. Please check your query or search for topics covered in your PDF.
                    </div>
                `;
                return;
            }

            resultsContainer.innerHTML = `<h3 style="margin-bottom:1rem; font-weight: 600; font-size: 1rem;">Top ${results.length} Contextual Citations</h3>`;

            results.forEach(item => {
                const clone = resultCardTemplate.content.cloneNode(true);
                clone.querySelector('.badge-source').textContent = `📄 ${item.metadata.source}`;
                clone.querySelector('.badge-page').textContent = `📖 Page ${item.metadata.page}`;

                const modelBadge = clone.querySelector('.badge-model');
                if (modelBadge) {
                    modelBadge.textContent = `⚡ ${item.model_label || 'Base Model'}`;
                }

                clone.querySelector('.badge-score').textContent = `🏆 RRF Score: ${item.rrf_score.toFixed(6)}`;

                // Key Snippet Extraction & Query Highlighting
                const directAnswerBox = clone.querySelector('.direct-answer-box');
                const keySnippet = extractKeyAnswerSnippet(item.content, query);
                if (keySnippet && directAnswerBox) {
                    directAnswerBox.style.display = 'block';
                    directAnswerBox.innerHTML = `<strong>💡 Key Answer Snippet:</strong><div class="snippet-text">${highlightQueryText(keySnippet, query)}</div>`;
                }

                // Full Chunk Content with Highlighting
                const cardContent = clone.querySelector('.card-content');
                if (cardContent) {
                    cardContent.innerHTML = highlightQueryText(item.content, query);
                }

                const faissRank = item.faiss_rank !== null ? `#${item.faiss_rank}` : 'N/A';
                const bm25Rank = item.bm25_rank !== null ? `#${item.bm25_rank}` : 'N/A';

                clone.querySelector('.meta-rank').innerHTML = `Engine Retrieval Coordinates: FAISS Rank: <strong>${faissRank}</strong> | BM25 Rank: <strong>${bm25Rank}</strong>`;

                resultsContainer.appendChild(clone);
            });

        } catch (e) {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            if (resultsContainer) resultsContainer.innerHTML = '<div class="warning-box">Network Error executing search.</div>';
        }
    }

    /* ══════════════════════════════════════════════════
       CHAT MODE — Conversational Interface
       ══════════════════════════════════════════════════ */
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');

    // Auto-resize textarea
    if (chatInput) {
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
        });

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatSend();
            }
        });
    }

    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', () => chatSend());
    }

    function clearChatWelcome() {
        const welcome = chatMessages.querySelector('.chat-welcome');
        if (welcome) welcome.remove();
    }

    function addUserBubble(text) {
        clearChatWelcome();
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble chat-bubble-user';
        bubble.textContent = text;
        chatMessages.appendChild(bubble);
        scrollChatToBottom();
    }

    function addBotBubble(text, source) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble chat-bubble-bot';
        bubble.textContent = text;
        if (source) {
            const srcEl = document.createElement('span');
            srcEl.className = 'bot-source';
            srcEl.textContent = `📄 Source: ${source}`;
            bubble.appendChild(srcEl);
        }
        chatMessages.appendChild(bubble);
        scrollChatToBottom();
    }

    function addErrorBubble(text) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble-error';
        bubble.textContent = text;
        chatMessages.appendChild(bubble);
        scrollChatToBottom();
    }

    function showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.id = 'typingIndicator';
        indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
        chatMessages.appendChild(indicator);
        scrollChatToBottom();
    }

    function removeTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) indicator.remove();
    }

    function scrollChatToBottom() {
        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }

    async function chatSend() {
        const query = chatInput.value.trim();
        if (!query) return;

        chatInput.value = '';
        chatInput.style.height = 'auto';

        // Add user bubble
        addUserBubble(query);

        // Show typing indicator
        showTypingIndicator();

        try {
            const res = await fetch(`/search?query=${encodeURIComponent(query)}&top_k=1&top_k_retrieval=20`);
            const results = await res.json();

            removeTypingIndicator();

            if (!results || results.length === 0) {
                addErrorBubble("Sorry, I couldn't find an answer to that in your uploaded documents. Try rephrasing your question or make sure your PDF covers this topic.");
                return;
            }

            // Get rank #1 result
            const topResult = results[0];
            const keySnippet = extractKeyAnswerSnippet(topResult.content, query);

            // Clean answer: strip any HTML tags and use raw text
            let cleanAnswer = keySnippet ? stripHtmlTags(keySnippet) : '';

            // If snippet is too short or empty, use first 2 sentences of the content
            if (!cleanAnswer || cleanAnswer.trim().length < 10) {
                const sentences = topResult.content.split(/(?<=[.!?])\s+/).slice(0, 3);
                cleanAnswer = sentences.join(' ');
            }

            const source = topResult.metadata
                ? `${topResult.metadata.source} — Page ${topResult.metadata.page}`
                : null;

            addBotBubble(cleanAnswer.trim(), source);

        } catch (e) {
            removeTypingIndicator();
            addErrorBubble("Network error occurred. Please check if the server is running.");
        }
    }

    /* ══════════════════════════════════════════════════
       INITIALIZATION
       ══════════════════════════════════════════════════ */
    refreshFiles();
    fetchModelStatus();

});
