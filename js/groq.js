/**
 * Groq API Service
 * https://console.groq.com
 */

const Groq = {
    API_URL: 'https://api.groq.com/openai/v1/chat/completions',

    /**
     * Available Models (gratis semua!)
     * - llama-3.3-70b-versatile (recommended)
     * - meta-llama/llama-4-scout-17b-16e-instruct (newest, for reasoning)
     * - llama-3.1-8b-instant (lebih cepat)
     * - mixtral-8x7b-32768
     * - gemma2-9b-it
     */

    /**
     * Send chat request to Groq API
     * @param {string} userMessage - Pesan dari user
     * @param {string} context - Konteks dari RAG
     * @param {number} retryCount - Counter untuk retry (max 3)
     */
    async chat(userMessage, context = '', retryCount = 0) {
        const apiKey = await Storage.getApiKey();
        
        if (!apiKey) {
            throw new Error('API Key belum diatur. Silakan atur di halaman Settings.');
        }

        // Build system message with context
        let systemContent = await Storage.getSystemPrompt();
        
        if (context) {
            systemContent += `\n\n---\n📚 INFORMASI REFERENSI (gunakan informasi ini untuk menjawab jika relevan):\n\n${context}\n---`;
        }

        // Get chat history for context
        const history = Storage.getChatHistory();
        const recentHistory = history.slice(-5); // Last 5 messages (hemat token)

        // Build messages array
        const messages = [
            { role: 'system', content: systemContent },
            ...recentHistory.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: userMessage }
        ];

        try {
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: await Storage.getModel(),
                    messages: messages,
                    temperature: 0.3,  // Lebih rendah = lebih konsisten & fokus
                    max_tokens: 1024,  // Lebih pendek = lebih padat
                    top_p: 0.85        // Lebih strict dalam pemilihan kata
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                // Handle specific errors
                if (response.status === 401) {
                    throw new Error('API Key tidak valid. Periksa kembali di Settings.');
                } else if (response.status === 429) {
                    // Rate limit - coba rotate ke API key berikutnya (max 3 retry)
                    if (retryCount < 3) {
                        console.warn(`⚠️ Rate limit hit (attempt ${retryCount + 1}/3), rotating to next API key...`);
                        Storage.rotateApiKey();
                        // Tunggu 2 detik sebelum retry (lebih aman)
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        return await this.chat(userMessage, context, retryCount + 1);
                    }
                    
                    // Sudah coba 3x, semua kena rate limit
                    Storage.resetApiKeyIndex();
                    throw new Error('Rate limit tercapai di semua API key. Tunggu 1-2 menit lalu coba lagi.');
                } else {
                    throw new Error(errorData.error?.message || `API Error: ${response.status}`);
                }
            }

            const data = await response.json();
            
            // Reset index jika berhasil
            Storage.resetApiKeyIndex();
            
            return data.choices[0].message.content;

        } catch (error) {
            console.error('Groq API Error:', error);
            throw error;
        }
    }
};

// Alias untuk kompatibilitas (jika ada kode yang masih pakai 'Grok')
const Grok = Groq;