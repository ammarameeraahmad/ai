/**
 * Storage Service - Firebase Realtime Database untuk settings (public/online)
 * LocalStorage hanya untuk session dan chat history
 */

const Storage = {
    KEYS: {
        SESSION: 'ugm_chatbot_session',
        CHAT_HISTORY: 'ugm_chatbot_history'
    },

    // Cache untuk settings (agar tidak perlu fetch terus-menerus)
    _settingsCache: null,
    _cacheTime: 0,
    _cacheDuration: 30000, // 30 detik

    // Settings - FROM FIREBASE (Public)
    async getSettings() {
        // Return cache jika masih fresh
        if (this._settingsCache && (Date.now() - this._cacheTime < this._cacheDuration)) {
            return this._settingsCache;
        }

        try {
            const snapshot = await database.ref('settings').once('value');
            const data = snapshot.val() || {};
            
            // Update cache
            this._settingsCache = data;
            this._cacheTime = Date.now();
            
            return data;
        } catch (error) {
            console.error('Error loading settings from Firebase:', error);
            return this._settingsCache || {};
        }
    },

    async saveSettings(settings) {
        try {
            const current = await this.getSettings();
            const updated = { ...current, ...settings };
            
            await database.ref('settings').set(updated);
            
            // Update cache
            this._settingsCache = updated;
            this._cacheTime = Date.now();
            
            return true;
        } catch (error) {
            console.error('Error saving settings to Firebase:', error);
            return false;
        }
    },

    async getApiKey() {
        const settings = await this.getSettings();
        const apiKeys = settings.apiKeys || [settings.apiKey || ''];
        
        // Filter empty keys
        const validKeys = apiKeys.filter(key => key && key.trim());
        
        if (validKeys.length === 0) return '';
        
        // Get current key index from localStorage (untuk rotate)
        let currentIndex = parseInt(localStorage.getItem('ugm_api_key_index') || '0');
        
        // Ensure index is valid
        if (currentIndex >= validKeys.length) {
            currentIndex = 0;
            localStorage.setItem('ugm_api_key_index', '0');
        }
        
        return validKeys[currentIndex];
    },

    // Rotate to next API key (dipanggil saat rate limit)
    rotateApiKey() {
        const currentIndex = parseInt(localStorage.getItem('ugm_api_key_index') || '0');
        const nextIndex = currentIndex + 1;
        localStorage.setItem('ugm_api_key_index', nextIndex.toString());
    },

    // Reset API key index (kembali ke key pertama)
    resetApiKeyIndex() {
        localStorage.setItem('ugm_api_key_index', '0');
    },

    async getModel() {
        const settings = await this.getSettings();
        return settings.model || 'llama-3.3-70b-versatile';
    },

    async getSystemPrompt() {
        const settings = await this.getSettings();
        return settings.systemPrompt || `Kamu adalah asisten virtual UGM (Universitas Gadjah Mada) yang ramah, helpful, dan informatif.

PANDUAN:
1. Jawab dalam Bahasa Indonesia yang baik tapi santai
2. Gunakan informasi dari REFERENSI yang diberikan sebagai prioritas utama
3. Jika REFERENSI tidak cukup tapi kamu tahu informasi umum tentang UGM/kampus, boleh jawab berdasarkan pengetahuan umum
4. Jawab RINGKAS, PADAT, dan FOKUS - langsung ke poin penting
5. Gunakan emoji sesekali biar lebih friendly 😊✨
6. Selalu usahakan kasih jawaban yang membantu, bukan langsung bilang tidak tahu

CONTOH:

User: "Kapan pendaftaran SNBP?"
Referensi: [HIGH] "Pendaftaran SNBP dibuka 10-20 Januari 2025"
✅ "Pendaftaran SNBP 2025 dibuka tanggal 10-20 Januari 2025! 📅"

User: "Apa itu Karismatif?"
Referensi: [MEDIUM] "UGM memiliki berbagai kegiatan kemahasiswaan"
✅ "Karismatif adalah salah satu kegiatan kemahasiswaan di UGM. Untuk info detail tentang Karismatif, kamu bisa cek website kemahasiswaan UGM atau hubungi himpunan terkait ya! 😊"

User: "Fakultas apa aja di UGM?"
Referensi: (kosong atau kurang detail)
✅ "UGM punya 18 fakultas, termasuk Teknik, Kedokteran, MIPA, Ekonomi, Hukum, dan lainnya. Masing-masing fakultas punya banyak program studi keren! 🎓 Ada fakultas yang mau kamu tahu lebih detail?"

IDENTITAS:
Kamu adalah "AI Assistant Karismatif Gadjah Mada". Jangan sebut diri sebagai Llama, GPT, Claude, atau model lain.`;
    },

    // Session
    getSessionId() {
        let sessionId = localStorage.getItem(this.KEYS.SESSION);
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem(this.KEYS.SESSION, sessionId);
        }
        return sessionId;
    },

    // Chat History (untuk context)
    getChatHistory() {
        const data = localStorage.getItem(this.KEYS.CHAT_HISTORY);
        return data ? JSON.parse(data) : [];
    },

    addToChatHistory(role, content) {
        const history = this.getChatHistory();
        history.push({ role, content, timestamp: Date.now() });
        
        // Keep only last 20 messages for context
        const trimmed = history.slice(-20);
        localStorage.setItem(this.KEYS.CHAT_HISTORY, JSON.stringify(trimmed));
    },

    clearChatHistory() {
        localStorage.removeItem(this.KEYS.CHAT_HISTORY);

    }
};