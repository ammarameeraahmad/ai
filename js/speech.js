/**
 * Voice Chat - Pro Version with Silero VAD
 * - Neural network voice activity detection
 * - Smart end-of-speech detection
 * - Continuous listening (can interrupt AI anytime)
 * - Default voice TTS
 * - Conversation history (last 5 chats)
 */

// ============================================================
// CONFIG
// ============================================================

const CONFIG = {
    WHISPER_MODELS: ['whisper-large-v3-turbo', 'whisper-large-v3'],
    CHAT_MODELS: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    API_URL: 'https://api.groq.com/openai/v1',
    MAX_RETRIES: 12
};

// ============================================================
// DOM
// ============================================================

const $ = id => document.getElementById(id);

const mascotContainer = $('mascotContainer');
const status = $('status');
const userText = $('userText');
const aiText = $('aiText');
const micBtn = $('micBtn');
const toastContainer = $('toastContainer');

// ============================================================
// STATE
// ============================================================

let isActive = false;
let isRecording = false;
let isSpeaking = false;
let isProcessing = false;

let vad = null;
let vadReady = false;

let maleVoice = null;
const synth = window.speechSynthesis;

let whisperModelIdx = 0;
let chatModelIdx = 0;

// History
let conversationHistory = [];

// ============================================================
// HELPERS
// ============================================================

function toast(msg, type = 'info') {
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = msg;
    toastContainer.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function setStatus(text, type = '') {
    status.textContent = text;
    status.className = `status ${type}`;
}

function setMascotState(state) {
    mascotContainer.className = `mascot-container ${state}`;
}

// ============================================================
// VOICE SELECTION - DEFAULT
// ============================================================

function findMaleVoice() {
    const voices = synth.getVoices();
    
    // 1. Prioritaskan Indonesian voice
    let voice = voices.find(v => v.lang.startsWith('id'));
    if (voice) return voice;
    
    // 2. Fallback ke English atau voice pertama
    voice = voices.find(v => v.lang.startsWith('en'));
    
    return voice || voices[0];
}

function loadVoices() {
    maleVoice = findMaleVoice();
    if (maleVoice) {
        console.log('🎤 Voice:', maleVoice.name, maleVoice.lang);
    }
}

synth.onvoiceschanged = loadVoices;
loadVoices();

// ============================================================
// API
// ============================================================

async function getApiKey() {
    return await Storage.getApiKey();
}

function rotateApiKey() {
    Storage.rotateApiKey();
}

function resetApiKeys() {
    const idx = parseInt(localStorage.getItem('ugm_api_key_index') || '0');
    if (idx > 0) Storage.resetApiKeyIndex();
}

// ============================================================
// CHAT HISTORY
// ============================================================

function loadHistory() {
    try {
        const saved = localStorage.getItem('ugm_voice_history');
        if (saved) {
            conversationHistory = JSON.parse(saved);
        }
    } catch (err) {
        conversationHistory = [];
    }
}

function saveHistory() {
    try {
        // Keep only last 10 messages (5 pairs)
        const trimmed = conversationHistory.slice(-10);
        localStorage.setItem('ugm_voice_history', JSON.stringify(trimmed));
        conversationHistory = trimmed;
    } catch (err) {
        console.error('Save history error:', err);
    }
}

function addToHistory(role, content) {
    conversationHistory.push({ role, content });
    saveHistory();
}

// ============================================================
// SILERO VAD
// ============================================================

async function initVAD() {
    try {
        setStatus('Loading...', 'processing');
        
        vad = await window.vad.MicVAD.new({
            positiveSpeechThreshold: 0.7,
            negativeSpeechThreshold: 0.5,
            redemptionFrames: 8,
            
            onSpeechStart: () => {
                if (isSpeaking) {
                    stopSpeaking();
                }
                startRecording();
            },
            
            onSpeechEnd: (audio) => {
                if (isRecording) {
                    stopRecording();
                    processAudio(audio);
                }
            },
            
            onVADMisfire: () => {
                if (isRecording) {
                    stopRecording();
                    setStatus('🎤 Siap mendengar', 'listening');
                }
            }
        });
        
        vadReady = true;
        
    } catch (err) {
        console.error('VAD init error:', err);
        vadReady = false;
    }
}

// ============================================================
// SPEECH TO TEXT
// ============================================================

async function transcribe(audioData, retry = 0) {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('API Key belum diatur');

    const model = CONFIG.WHISPER_MODELS[whisperModelIdx];
    
    const formData = new FormData();
    formData.append('file', audioData, 'audio.wav');
    formData.append('model', model);
    formData.append('language', 'id');
    formData.append('temperature', '0');

    try {
        const res = await fetch(`${CONFIG.API_URL}/audio/transcriptions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            
            if (res.status === 429 && retry < CONFIG.MAX_RETRIES) {
                rotateApiKey();
                await new Promise(r => setTimeout(r, 1000));
                return await transcribe(audioData, retry + 1);
            }
            
            throw new Error(errData.error?.message || `Whisper Error: ${res.status}`);
        }

        resetApiKeys();
        const data = await res.json();
        return data.text;

    } catch (err) {
        throw err;
    }
}

async function audioDataToBlob(float32Array) {
    const sampleRate = 16000;
    const numChannels = 1;
    const bitsPerSample = 16;
    
    const dataLength = float32Array.length * 2;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
    view.setUint16(32, numChannels * bitsPerSample / 8, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    
    let offset = 44;
    for (let i = 0; i < float32Array.length; i++) {
        let sample = Math.max(-1, Math.min(1, float32Array[i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true);
        offset += 2;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
}

// ============================================================
// CHAT
// ============================================================

async function chat(message, retry = 0) {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('API Key belum diatur');

    const model = CONFIG.CHAT_MODELS[chatModelIdx];
    
    const docs = await RAG.search(message, 3);
    const context = RAG.buildContext(docs);
    
    let systemPrompt = await Storage.getSystemPrompt();
    systemPrompt += '\n\nJawab SINGKAT, maksimal 2-3 kalimat karena akan dibacakan.';
    
    if (context) {
        systemPrompt += `\n\n📚 REFERENSI:\n${context}`;
    }

    // Build messages with history (last 5 messages = 10 items)
    const recentHistory = conversationHistory.slice(-10);
    const messages = [
        { role: 'system', content: systemPrompt },
        ...recentHistory,
        { role: 'user', content: message }
    ];

    try {
        const res = await fetch(`${CONFIG.API_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages: messages,
                temperature: 0.5,
                max_tokens: 250
            })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            
            if (res.status === 429 && retry < CONFIG.MAX_RETRIES) {
                rotateApiKey();
                await new Promise(r => setTimeout(r, 1000));
                return await chat(message, retry + 1);
            }
            
            throw new Error(errData.error?.message || `Chat Error: ${res.status}`);
        }

        resetApiKeys();
        const data = await res.json();
        return data.choices[0].message.content;

    } catch (err) {
        throw err;
    }
}

// ============================================================
// TEXT TO SPEECH
// ============================================================

function speak(text) {
    return new Promise((resolve, reject) => {
        if (!maleVoice) {
            loadVoices();
        }
        
        stopSpeaking();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = maleVoice;
        utterance.lang = maleVoice?.lang || 'id-ID';
        utterance.rate = 1.15;  // Slightly faster = younger
        utterance.pitch = 1.15; // Higher pitch = younger but still natural
        
        isSpeaking = true;
        setStatus('🗣️ AI berbicara...', 'speaking');
        setMascotState('speaking');
        
        utterance.onend = () => {
            isSpeaking = false;
            if (isActive) {
                setStatus('🎤 Siap mendengar', 'listening');
                setMascotState('listening');
            } else {
                setStatus('Tekan 🎤 untuk mulai', '');
                setMascotState('');
            }
            resolve();
        };
        
        utterance.onerror = (err) => {
            isSpeaking = false;
            setStatus('⚠️ TTS error', 'error');
            setMascotState('');
            reject(err);
        };
        
        synth.speak(utterance);
    });
}

function stopSpeaking() {
    if (synth.speaking) {
        synth.cancel();
        isSpeaking = false;
    }
}

// ============================================================
// RECORDING
// ============================================================

function startRecording() {
    if (isRecording) return;
    
    isRecording = true;
    setStatus('🎤 Mendengarkan...', 'listening');
    setMascotState('listening');
}

function stopRecording() {
    if (!isRecording) return;
    
    isRecording = false;
    setMascotState('');
}

// ============================================================
// PROCESS
// ============================================================

async function processAudio(audioData) {
    if (isProcessing) return;
    
    isProcessing = true;
    micBtn.disabled = true;
    
    try {
        setStatus('⚙️ Memproses audio...', 'processing');
        setMascotState('processing');
        
        const audioBlob = await audioDataToBlob(audioData);
        
        setStatus('📝 Transcribing...', 'processing');
        const text = await transcribe(audioBlob);
        
        if (!text || text.trim().length === 0) {
            throw new Error('Tidak ada suara terdeteksi');
        }
        
        userText.textContent = text;
        
        setStatus('🤔 AI berpikir...', 'processing');
        const response = await chat(text);
        
        aiText.textContent = response;
        
        // Save to history
        addToHistory('user', text);
        addToHistory('assistant', response);
        
        await speak(response);
        
    } catch (err) {
        console.error('Process error:', err);
        setStatus(`❌ ${err.message}`, 'error');
        setMascotState('');
        
        if (isActive) {
            setTimeout(() => {
                setStatus('🎤 Siap mendengar', 'listening');
                setMascotState('listening');
            }, 2000);
        }
    } finally {
        isProcessing = false;
        micBtn.disabled = false;
    }
}

// ============================================================
// TOGGLE VAD
// ============================================================

async function toggleVAD() {
    if (!vadReady) return;
    
    isActive = !isActive;
    
    if (isActive) {
        micBtn.classList.add('recording');
        setStatus('🎤 Siap mendengar', 'listening');
        setMascotState('listening');
        vad.start();
    } else {
        micBtn.classList.remove('recording');
        setStatus('Tekan 🎤 untuk mulai', '');
        setMascotState('');
        stopSpeaking();
        vad.pause();
    }
}

// ============================================================
// EVENTS
// ============================================================

micBtn.addEventListener('click', toggleVAD);

// ============================================================
// INIT
// ============================================================

async function init() {
    // Load conversation history
    loadHistory();
    
    setStatus('Loading...', 'processing');
    await initVAD();
    
    if (vadReady) {
        setStatus('Tekan 🎤 untuk mulai', '');
    } else {
        setStatus('Gagal memuat', 'error');
    }
}

init();
