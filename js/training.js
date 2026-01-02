/**
 * Training Interface Logic
 * Using Firebase Realtime Database
 */

// DOM Elements
const trainingForm = document.getElementById('trainingForm');
const docTitle = document.getElementById('docTitle');
const docTags = document.getElementById('docTags');
const docQuestion = document.getElementById('docQuestion');
const docContent = document.getElementById('docContent');
const submitBtn = document.getElementById('submitBtn');
const cancelBtn = document.getElementById('cancelBtn');
const editingId = document.getElementById('editingId');
const formTitle = document.getElementById('formTitle');
const knowledgeList = document.getElementById('knowledgeList');
const docCount = document.getElementById('docCount');
const clearAllBtn = document.getElementById('clearAllBtn');
const searchInput = document.getElementById('searchInput');
const toastContainer = document.getElementById('toastContainer');

let allDocuments = [];
let isEditMode = false;

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

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ============================================================
// FIREBASE REALTIME DATABASE OPERATIONS
// ============================================================

async function generateQuestion(title, content, retryCount = 0) {
    try {
        const apiKey = await Storage.getApiKey();
        if (!apiKey) return title + '?'; // Fallback to title if no API key
        
        const snippet = content.substring(0, 300);
        const prompt = `Buat 1 pertanyaan pendek (3-5 kata) dalam Bahasa Indonesia.

ATURAN KETAT:
1. Pertanyaan HARUS berkaitan langsung dengan judul: "${title}"
2. JANGAN tambahkan kata yang TIDAK ADA di judul/konten
3. Gunakan kata kunci UTAMA dari judul
4. Format: pertanyaan langsung, diakhiri tanda tanya (?)

Konten singkat: ${snippet}...

CONTOH BAIK:
- Judul "Kantin UGM" → "Dimana kantin UGM?"
- Judul "Beasiswa Prestasi" → "Syarat beasiswa prestasi?"
- Judul "Jadwal Pendaftaran" → "Kapan jadwal pendaftaran?"

CONTOH BURUK (JANGAN SEPERTI INI):
- Judul "Kantin UGM" → "Kantor kantin UGM?" ❌ (kata "Kantor" tidak ada di judul)

Pertanyaan untuk "${title}":`;
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant', // Model lebih ringan & cepat
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 25
            })
        });
        
        // Handle rate limit dengan retry
        if (response.status === 429 && retryCount < 3) {
            console.log('⚠️ Rate limit, rotating API key...');
            Storage.rotateApiKey();
            // Tunggu sebentar sebelum retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            return generateQuestion(title, content, retryCount + 1);
        }
        
        if (!response.ok) {
            console.warn('API error, using title as fallback');
            return title + '?';
        }
        
        const data = await response.json();
        let question = data.choices[0].message.content.trim();
        
        // Cleanup: hapus quotes, numbering, dll
        question = question.replace(/^["'\d.\-\s]+/, '').replace(/["']$/g, '');
        
        // Pastikan ada tanda tanya
        if (!question.endsWith('?')) question += '?';
        
        // Reset API key index setelah sukses
        Storage.resetApiKeyIndex();
        
        return question;
    } catch (error) {
        console.error('Error generating question:', error);
        return title + '?'; // Fallback to title on error
    }
}

async function addKnowledge(title, content, tags, suggestedQuestion) {
    const newRef = database.ref('knowledge').push();
    await newRef.set({
        title: title,
        content: content,
        tags: tags,
        suggestedQuestion: suggestedQuestion || title,
        createdAt: Date.now()
    });
    return newRef.key;
}

async function updateKnowledge(docId, title, content, tags, suggestedQuestion) {
    await database.ref('knowledge/' + docId).update({
        title: title,
        content: content,
        tags: tags,
        suggestedQuestion: suggestedQuestion || title,
        updatedAt: Date.now()
    });
}

async function loadKnowledge() {
    try {
        const snapshot = await database.ref('knowledge').orderByChild('createdAt').once('value');
        const data = snapshot.val();
        
        if (!data) {
            allDocuments = [];
            renderKnowledgeList([]);
            docCount.textContent = '0';
            return;
        }

        // Convert object to array and reverse (newest first)
        allDocuments = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
        })).reverse();
        
        renderKnowledgeList(allDocuments);
        docCount.textContent = allDocuments.length;
        
    } catch (error) {
        console.error('Load knowledge error:', error);
        showToast('Gagal memuat knowledge base', 'error');
    }
}

async function deleteKnowledge(docId) {
    await database.ref('knowledge/' + docId).remove();
}

async function clearAllKnowledge() {
    await database.ref('knowledge').remove();
}

// ============================================================
// UI FUNCTIONS
// ============================================================

function renderKnowledgeList(documents) {
    if (documents.length === 0) {
        knowledgeList.innerHTML = `
            <div class="empty-state">
                <div class="icon">📭</div>
                <p>Belum ada knowledge yang ditambahkan</p>
            </div>
        `;
        return;
    }
    
    knowledgeList.innerHTML = documents.map(doc => `
        <div class="knowledge-item" data-id="${doc.id}">
            <div class="knowledge-item-header">
                <h4>${escapeHtml(doc.title)}</h4>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="edit-btn" onclick="handleEdit('${doc.id}')" title="Edit">✏️</button>
                    <button class="delete-btn" onclick="handleDelete('${doc.id}')" title="Hapus">🗑️</button>
                </div>
            </div>
            ${doc.suggestedQuestion ? `<div class="knowledge-item-question">❓ ${escapeHtml(doc.suggestedQuestion)}</div>` : ''}
            <p>${escapeHtml(doc.content.substring(0, 200))}${doc.content.length > 200 ? '...' : ''}</p>
            ${doc.tags && doc.tags.length > 0 ? `
                <div class="knowledge-item-tags">
                    ${doc.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
            <div class="knowledge-item-date">📅 ${formatDate(doc.createdAt)}</div>
        </div>
    `).join('');
}

function setFormLoading(loading) {
    submitBtn.disabled = loading;
    docTitle.disabled = loading;
    docTags.disabled = loading;
    docQuestion.disabled = loading;
    docContent.disabled = loading;
    
    if (isEditMode) {
        submitBtn.innerHTML = loading 
            ? '<span>⏳</span><span>Menyimpan...</span>'
            : '<span>💾</span><span>Update Knowledge</span>';
    } else {
        submitBtn.innerHTML = loading 
            ? '<span>⏳</span><span>Menyimpan...</span>'
            : '<span>💾</span><span>Simpan Knowledge</span>';
    }
}

function setEditMode(docId) {
    const doc = allDocuments.find(d => d.id === docId);
    if (!doc) return;
    
    isEditMode = true;
    editingId.value = docId;
    
    // Populate form
    docTitle.value = doc.title;
    docTags.value = (doc.tags || []).join(', ');
    docQuestion.value = doc.suggestedQuestion || '';
    docContent.value = doc.content;
    
    // Update UI
    formTitle.innerHTML = '<span class="emoji">✏️</span> Edit Knowledge';
    submitBtn.innerHTML = '<span>💾</span><span>Update Knowledge</span>';
    cancelBtn.style.display = 'block';
    
    // Scroll to form
    trainingForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    docTitle.focus();
}

function resetForm() {
    isEditMode = false;
    editingId.value = '';
    
    // Clear form
    docTitle.value = '';
    docTags.value = '';
    docQuestion.value = '';
    docContent.value = '';
    
    // Reset UI
    formTitle.innerHTML = '<span class="emoji">📝</span> Tambah Knowledge';
    submitBtn.innerHTML = '<span>💾</span><span>Simpan Knowledge</span>';
    cancelBtn.style.display = 'none';
}

function filterKnowledge(query) {
    if (!query) {
        renderKnowledgeList(allDocuments);
        return;
    }
    
    const queryLower = query.toLowerCase();
    const filtered = allDocuments.filter(doc => 
        doc.title.toLowerCase().includes(queryLower) ||
        doc.content.toLowerCase().includes(queryLower) ||
        (doc.tags || []).some(tag => tag.toLowerCase().includes(queryLower))
    );
    
    renderKnowledgeList(filtered);
}

// ============================================================
// EVENT HANDLERS
// ============================================================

trainingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = docTitle.value.trim();
    const content = docContent.value.trim();
    const tagsText = docTags.value.trim();
    const tags = tagsText ? tagsText.split(',').map(t => t.trim()).filter(t => t) : [];
    let questionInput = docQuestion.value.trim();
    const skipAi = document.getElementById('skipAiGenerate')?.checked || false;
    
    if (!title || !content) {
        showToast('Judul dan konten harus diisi!', 'error');
        return;
    }
    
    setFormLoading(true);
    
    try {
        let question;
        
        // Jika pertanyaan diisi manual, gunakan itu (dengan auto "?")
        if (questionInput) {
            question = questionInput;
            if (!question.endsWith('?')) {
                question += '?';
            }
            showToast('💾 Menyimpan...', 'info');
        } else if (skipAi) {
            // Skip AI, pakai judul sebagai pertanyaan
            question = title;
            if (!question.endsWith('?')) {
                question += '?';
            }
            showToast('💾 Menyimpan (skip AI)...', 'info');
        } else {
            // Generate pakai AI
            showToast('🤖 Generating pertanyaan...', 'info');
            question = await generateQuestion(title, content);
        }
        
        if (isEditMode) {
            const docId = editingId.value;
            await updateKnowledge(docId, title, content, tags, question);
            showToast('Knowledge berhasil diupdate! ✨', 'success');
        } else {
            await addKnowledge(title, content, tags, question);
            showToast('Knowledge berhasil ditambahkan! 🎉', 'success');
        }
        
        resetForm();
        await loadKnowledge();
    } catch (error) {
        console.error('Error:', error);
        showToast('Gagal menyimpan knowledge: ' + error.message, 'error');
    } finally {
        setFormLoading(false);
    }
});

window.handleEdit = function(docId) {
    setEditMode(docId);
};

window.handleDelete = async function(docId) {
    if (!confirm('Hapus knowledge ini?')) return;
    
    try {
        await deleteKnowledge(docId);
        showToast('Knowledge berhasil dihapus!', 'success');
        
        // Reset form if editing this doc
        if (isEditMode && editingId.value === docId) {
            resetForm();
        }
        
        await loadKnowledge();
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Gagal menghapus knowledge', 'error');
    }
};

cancelBtn.addEventListener('click', () => {
    resetForm();
});

clearAllBtn.addEventListener('click', async () => {
    if (!confirm('Hapus SEMUA knowledge? Tindakan ini tidak dapat dibatalkan!')) return;
    
    try {
        await clearAllKnowledge();
        showToast('Semua knowledge berhasil dihapus!', 'success');
        await loadKnowledge();
    } catch (error) {
        console.error('Clear all error:', error);
        showToast('Gagal menghapus knowledge', 'error');
    }
});

searchInput.addEventListener('input', (e) => {
    filterKnowledge(e.target.value);
});

// ============================================================
// INITIALIZATION
// ============================================================

loadKnowledge();
console.log('📚 Training page initialized!');