/**
 * Chat Interface Logic
 */

const UGM_LOGO = 'UGM Logo [Universitas Gadjah Mada].jpg';

// DOM Elements
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');
const toastContainer = document.getElementById('toastContainer');
const apiWarning = document.getElementById('apiWarning');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const knowledgeCount = document.getElementById('knowledgeCount');
const suggestionChips = document.getElementById('suggestionChips');
const refreshSuggestions = document.getElementById('refreshSuggestions');

let isLoading = false;
let allKnowledgeTitles = [];

// ============================================================
// UTILITIES
// ============================================================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMessage(text) {
    let formatted = escapeHtml(text);
    // Bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
}

// ============================================================
// UI FUNCTIONS
// ============================================================

function addMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    let avatarContent = role === 'user' 
        ? '👤' 
        : `<img src="${UGM_LOGO}" alt="UGM">`;
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatarContent}</div>
        <div class="message-content">
            <div>${formatMessage(content)}</div>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function addTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'message assistant';
    indicator.id = 'typingIndicator';
    indicator.innerHTML = `
        <div class="message-avatar">
            <img src="${UGM_LOGO}" alt="UGM">
        </div>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(indicator);
    scrollToBottom();
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setLoading(loading) {
    isLoading = loading;
    sendButton.disabled = loading;
    chatInput.disabled = loading;
    
    if (loading) {
        addTypingIndicator();
    } else {
        removeTypingIndicator();
    }
}

function autoResize() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
}

function updateStatus(connected) {
    if (connected) {
        statusDot.classList.remove('offline');
        statusText.textContent = 'Online ✨';
    } else {
        statusDot.classList.add('offline');
        statusText.textContent = 'Offline';
    }
}

// ============================================================
// MAIN FUNCTIONS
// ============================================================

async function handleSend() {
    const message = chatInput.value.trim();
    if (!message || isLoading) return;
    
    chatInput.value = '';
    autoResize();
    
    addMessage('user', message);
    Storage.addToChatHistory('user', message);
    
    setLoading(true);
    
    try {
        // Ambil 3 pesan terakhir (user + assistant) untuk konteks RAG search
        const history = Storage.getChatHistory();
        const recentMessages = history
            .slice(-3)  // 3 pesan terakhir (mix user & assistant)
            .map(h => h.content)
            .join(' ');
        
        // Use RAG for semantic search - get top 5 for logging
        const allDocs = await RAG.search(message, 5, recentMessages);
        
        // 📊 LOG: Show top 5 scoring documents with details
        console.log('\n📊 ============ RAG SCORING RESULTS ============');
        console.log(`🔍 Query: "${message}"`);
        console.log(`📝 Context: "${recentMessages.substring(0, 50)}..."`);
        console.log('\n🏆 TOP 5 DOCUMENTS:\n');
        
        allDocs.forEach((doc, idx) => {
            console.log(`${idx + 1}. 📄 ${doc.title}`);
            console.log(`   ⭐ Total Score: ${doc.score.toFixed(2)}`);
            
            // Check if scores exist (Agentic RAG) or matchDetails (old RAG)
            const scores = doc.scores || doc.matchDetails;
            
            if (scores) {
                console.log(`   📊 Breakdown:`);
                if (scores.keywordMatch !== undefined) {
                    console.log(`      - Keyword Match:  ${scores.keywordMatch.toFixed(2)} × 5.0 = ${(scores.keywordMatch * 5.0).toFixed(2)}`);
                }
                if (scores.exactMatch !== undefined) {
                    console.log(`      - Exact Match:    ${scores.exactMatch.toFixed(2)} × 2.5 = ${(scores.exactMatch * 2.5).toFixed(2)}`);
                }
                if (scores.entityMatch !== undefined) {
                    console.log(`      - Entity Match:   ${scores.entityMatch.toFixed(2)} × 2.0 = ${(scores.entityMatch * 2.0).toFixed(2)}`);
                }
                if (scores.contextMatch !== undefined) {
                    console.log(`      - Context Match:  ${scores.contextMatch.toFixed(2)} × 1.5 = ${(scores.contextMatch * 1.5).toFixed(2)}`);
                }
            }
            
            console.log(`   📌 Tags: ${doc.tags.join(', ') || '-'}`);
            console.log(`   📝 Content Preview: "${doc.content.substring(0, 80)}..."`);
            console.log('');
        });
        
        // Filter dokumen yang relevan (score >= 3 untuk lebih permisif)
        const relevantDocs = allDocs.filter(doc => doc.score >= 3).slice(0, 5);
        
        console.log(`✅ Selected: ${relevantDocs.length} documents (score >= 3)`);
        console.log('=============================================\n');
        
        const contextResult = RAG.buildContext(relevantDocs);
        
        // Get AI response
        const response = await Groq.chat(message, contextResult.context || contextResult);
        
        addMessage('assistant', response);
        Storage.addToChatHistory('assistant', response);
        
    } catch (error) {
        console.error('Chat error:', error);
        showToast(error.message || 'Terjadi kesalahan', 'error');
        addMessage('assistant', `Waduh, ada error nih: ${error.message} 😅\n\nCoba cek Settings atau refresh halaman ya!`);
    } finally {
        setLoading(false);
        chatInput.focus();
        // Refresh suggestions after chat (update contextual suggestions)
        await loadSuggestions();
    }
}

async function checkStatus() {
    const apiKey = await Storage.getApiKey();
    if (!apiKey) {
        apiWarning.style.display = 'flex';
        updateStatus(false);
    } else {
        apiWarning.style.display = 'none';
        updateStatus(true);
    }
    
    const count = await RAG.getCount();
    knowledgeCount.textContent = count;
    
    // Load suggestions
    await loadSuggestions();
}

async function loadAllKnowledge() {
    try {
        const snapshot = await database.ref('knowledge').once('value');
        const data = snapshot.val();
        
        if (!data) {
            allKnowledgeTitles = [];
            return;
        }
        
        allKnowledgeTitles = Object.values(data).map(doc => ({
            title: doc.title,
            question: doc.suggestedQuestion || doc.title
        }));
    } catch (error) {
        console.error('Error loading knowledge titles:', error);
        allKnowledgeTitles = [];
    }
}

async function loadSuggestions() {
    await loadAllKnowledge();
    
    if (allKnowledgeTitles.length === 0) {
        suggestionChips.style.display = 'none';
        return;
    }
    
    const suggestions = [];
    
    // Get 1 contextual suggestion based on recent chat
    const history = Storage.getChatHistory();
    if (history.length > 0) {
        const recentUserMessages = history
            .filter(h => h.role === 'user')
            .slice(-2)
            .map(h => h.content)
            .join(' ');
        
        if (recentUserMessages) {
            const relevantDocs = await RAG.search(recentUserMessages, 1, '');
            if (relevantDocs.length > 0) {
                const doc = allKnowledgeTitles.find(t => t.title === relevantDocs[0].title);
                if (doc) suggestions.push(doc.question);
            }
        }
    }
    
    // Fill remaining with 2 random suggestions
    const remaining = 3 - suggestions.length;
    const availableQuestions = allKnowledgeTitles
        .filter(t => !suggestions.includes(t.question))
        .map(t => t.question);
    
    for (let i = 0; i < remaining && availableQuestions.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * availableQuestions.length);
        suggestions.push(availableQuestions[randomIndex]);
        availableQuestions.splice(randomIndex, 1);
    }
    
    // Update UI
    const chipButtons = suggestionChips.querySelectorAll('.suggestion-chip');
    suggestions.forEach((suggestion, index) => {
        if (chipButtons[index]) {
            chipButtons[index].textContent = suggestion;
            chipButtons[index].dataset.suggestion = suggestion;
            chipButtons[index].style.display = 'inline-flex';
        }
    });
    
    // Hide unused chips
    for (let i = suggestions.length; i < chipButtons.length; i++) {
        chipButtons[i].style.display = 'none';
    }
    
    if (suggestions.length > 0) {
        suggestionChips.style.display = 'flex';
    }
}

function handleSuggestionClick(suggestion) {
    chatInput.value = suggestion;
    autoResize();
    chatInput.focus();
}

// ============================================================
// EVENT LISTENERS
// ============================================================

sendButton.addEventListener('click', handleSend);

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

chatInput.addEventListener('input', autoResize);

// Suggestion chips click
suggestionChips.addEventListener('click', (e) => {
    if (e.target.classList.contains('suggestion-chip')) {
        const suggestion = e.target.dataset.suggestion;
        if (suggestion) {
            handleSuggestionClick(suggestion);
        }
    }
});

// Refresh suggestions
refreshSuggestions.addEventListener('click', async () => {
    await loadSuggestions();
});

// ============================================================
// INITIALIZATION
// ============================================================

async function init() {
    await checkStatus();
    chatInput.focus();
    console.log('💬 Chat initialized! ✨');
}

init();