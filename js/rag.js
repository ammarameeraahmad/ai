/**
 * 🤖 AGENTIC RAG - Retrieval with Autonomous Agent
 * ================================================
 * 
 * Sistem RAG dengan agen otonom yang bisa:
 * - Extract keywords dari query (buang stop words)
 * - Self-evaluate hasil pencarian
 * - Self-correct dengan strategi berbeda jika hasil kurang baik
 * - Multi-iteration search untuk hasil optimal
 * 
 * Using Firebase Realtime Database
 */

const RAG = {
    // ============================================================
    // CONFIGURATION
    // ============================================================
    config: {
        MAX_ITERATIONS: 3,           // Maksimal iterasi pencarian
        MIN_CONFIDENCE_SCORE: 15,    // Score minimum untuk "confident"
        MIN_ACCEPTABLE_SCORE: 8,     // Score minimum untuk "acceptable"
        TOP_K: 3,                    // Jumlah dokumen yang dikembalikan
        DEBUG: true                  // Enable detailed logging
    },

    // ============================================================
    // STOP WORDS - Kata yang akan dibuang dari query
    // ============================================================
    stopWords: new Set([
        // Kata tanya
        'apa', 'apakah', 'siapa', 'siapakah', 'kapan', 'kapankah', 'dimana', 'dimanakah',
        'kemana', 'kemanakah', 'bagaimana', 'gimana', 'mengapa', 'kenapa', 'berapa',
        'mana', 'what', 'who', 'when', 'where', 'why', 'how', 'which',
        
        // Kata bantu
        'adalah', 'merupakan', 'yaitu', 'ialah', 'yakni', 'seperti',
        'akan', 'sudah', 'telah', 'sedang', 'belum', 'pernah', 'masih',
        'bisa', 'dapat', 'boleh', 'harus', 'wajib', 'perlu', 'mau', 'ingin',
        
        // Preposisi
        'di', 'ke', 'dari', 'pada', 'untuk', 'bagi', 'dengan', 'tanpa',
        'oleh', 'tentang', 'mengenai', 'terhadap', 'antara', 'hingga', 'sampai',
        'sejak', 'selama', 'sebelum', 'sesudah', 'setelah', 'ketika', 'saat',
        
        // Konjungsi
        'dan', 'atau', 'serta', 'tetapi', 'tapi', 'namun', 'melainkan',
        'karena', 'sebab', 'jika', 'bila', 'kalau', 'apabila', 'supaya', 'agar',
        
        // Kata ganti
        'saya', 'aku', 'kamu', 'kau', 'anda', 'dia', 'ia', 'beliau',
        'kami', 'kita', 'mereka', 'ini', 'itu', 'tersebut', 'nya',
        
        // Partikel & kata umum
        'ya', 'dong', 'deh', 'sih', 'lah', 'kah', 'pun', 'kok',
        'tidak', 'nggak', 'ngga', 'gak', 'ga', 'tak', 'bukan', 'jangan',
        'sangat', 'sekali', 'banget', 'amat', 'paling', 'lebih', 'kurang',
        'semua', 'seluruh', 'setiap', 'tiap', 'beberapa', 'banyak', 'sedikit',
        'ada', 'terdapat', 'punya', 'memiliki',
        'jadi', 'menjadi', 'sebagai', 'sebuah', 'suatu', 'satu',
        'tolong', 'mohon', 'coba', 'kasih', 'tau', 'tahu',
        'aja', 'saja', 'doang', 'cuma', 'hanya',
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be',
        'have', 'has', 'had', 'do', 'does', 'did',
        'in', 'on', 'at', 'by', 'for', 'with', 'about',
        'to', 'from', 'up', 'down', 'out', 'off'
    ]),

    // ============================================================
    // SYNONYM MAPPING
    // ============================================================
    synonyms: {
        'daftar': ['pendaftaran', 'registrasi', 'mendaftar', 'masuk'],
        'pendaftaran': ['daftar', 'registrasi', 'masuk', 'mendaftar'],
        'biaya': ['harga', 'bayar', 'uang', 'tarif', 'ukt', 'spp', 'pembayaran'],
        'kuliah': ['perkuliahan', 'belajar', 'kelas', 'studi', 'kampus'],
        'jalur': ['cara', 'metode', 'rute', 'jalan'],
        'masuk': ['penerimaan', 'lolos', 'diterima', 'daftar'],
        'snbp': ['snmptn', 'undangan', 'prestasi', 'rapor'],
        'snbt': ['sbmptn', 'ujian', 'tes', 'test'],
        'fakultas': ['fak', 'jurusan', 'prodi', 'program studi', 'departemen'],
        'mahasiswa': ['mhs', 'mahasiswi', 'siswa', 'murid', 'student'],
        'beasiswa': ['scholarship', 'bantuan'],
        'wisuda': ['graduation', 'lulus', 'kelulusan'],
        'jadwal': ['schedule', 'waktu', 'tanggal', 'jam'],
        'lokasi': ['tempat', 'alamat', 'location'],
        'ugm': ['universitas gadjah mada', 'gadjah mada', 'gm', 'gajahmada'],
        'karismatif': ['karisma', 'karis'],
        'syarat': ['persyaratan', 'ketentuan', 'kondisi'],
        'info': ['informasi', 'keterangan', 'detail'],
        'klaster': ['cluster', 'rumpun', 'kelompok'],
        'teknik': ['engineering', 'ft'],
        'departemen': ['dept', 'jurusan', 'prodi']
    },

    // ============================================================
    // IMPORTANT TERMS
    // ============================================================
    importantTerms: new Set([
        'ugm', 'snbp', 'snbt', 'karismatif', '2024', '2025', '2026',
        'fakultas', 'jurusan', 'prodi', 'beasiswa', 'wisuda',
        'klaster', 'teknik', 'saintek', 'soshum', 'kedokteran', 'hukum',
        'ekonomi', 'mipa', 'pertanian', 'psikologi', 'filsafat',
        'departemen', 'pendaftaran', 'biaya', 'ukt', 'spp'
    ]),

    // ============================================================
    // 🤖 AGENT: Main Entry Point
    // ============================================================
    
    /**
     * Agentic Search - Entry point utama
     * Agen akan berpikir, mencari, evaluasi, dan koreksi jika perlu
     */
    async agentSearch(query, conversationContext = '') {
        this.log('\n' + '═'.repeat(70));
        this.log('🤖 AGENTIC RAG - AUTONOMOUS SEARCH INITIATED');
        this.log('═'.repeat(70));
        this.log(`📥 User Query: "${query}"`);
        
        // Agent State
        const agentState = {
            originalQuery: query,
            currentQuery: query,
            iterations: 0,
            searchHistory: [],
            bestResults: [],
            bestScore: 0,
            confidence: 'none',
            strategies: ['keyword', 'expanded', 'fuzzy'],
            currentStrategy: 0,
            thinking: []
        };

        // Load knowledge base once
        const snapshot = await database.ref('knowledge').once('value');
        const knowledgeBase = snapshot.val();
        
        if (!knowledgeBase) {
            this.log('⚠️ Knowledge base kosong!');
            return { results: [], context: '', confidence: 'none', agentLog: agentState.thinking };
        }

        this.log(`📚 Knowledge Base: ${Object.keys(knowledgeBase).length} dokumen`);

        // ============================================================
        // AGENT LOOP - Iterasi sampai confident atau max iterations
        // ============================================================
        while (agentState.iterations < this.config.MAX_ITERATIONS) {
            agentState.iterations++;
            
            this.log('\n' + '─'.repeat(70));
            this.log(`🔄 ITERATION ${agentState.iterations}/${this.config.MAX_ITERATIONS}`);
            this.log('─'.repeat(70));

            // Step 1: Agent thinks about the query
            const analysis = this.agentAnalyzeQuery(agentState);
            agentState.thinking.push(`Iteration ${agentState.iterations}: ${analysis.thought}`);
            
            // Step 2: Agent performs search with current strategy
            const searchResults = this.agentPerformSearch(
                analysis.keywords, 
                knowledgeBase, 
                agentState
            );
            
            // Step 3: Agent evaluates results
            const evaluation = this.agentEvaluateResults(searchResults, agentState);
            agentState.thinking.push(`Evaluation: ${evaluation.assessment}`);
            
            // Step 4: Agent decides next action
            if (evaluation.isConfident) {
                this.log('\n✅ Agent: "Hasil sudah cukup baik! Saya confident dengan jawaban ini."');
                agentState.bestResults = searchResults;
                agentState.confidence = evaluation.confidence;
                break;
            } else if (evaluation.shouldRetry && agentState.iterations < this.config.MAX_ITERATIONS) {
                this.log('\n🔄 Agent: "Hasil belum optimal. Saya akan mencoba strategi lain..."');
                agentState.currentStrategy++;
                
                // Update query berdasarkan strategi baru
                agentState.currentQuery = this.agentRefineQuery(agentState, evaluation);
                agentState.thinking.push(`Refining query to: "${agentState.currentQuery}"`);
            } else {
                this.log('\n⚠️ Agent: "Ini hasil terbaik yang bisa saya temukan."');
                if (searchResults.length > 0 && this.getTotalScore(searchResults) > agentState.bestScore) {
                    agentState.bestResults = searchResults;
                    agentState.bestScore = this.getTotalScore(searchResults);
                }
                agentState.confidence = evaluation.confidence;
            }
        }

        // Final output
        const contextData = this.buildContext(agentState.bestResults);
        
        this.log('\n' + '═'.repeat(70));
        this.log('🎯 AGENT SEARCH COMPLETE');
        this.log('═'.repeat(70));
        this.log(`📊 Total Iterations: ${agentState.iterations}`);
        this.log(`🎯 Final Confidence: ${agentState.confidence}`);
        this.log(`📄 Documents Found: ${agentState.bestResults.length}`);
        this.log('═'.repeat(70) + '\n');

        return {
            results: agentState.bestResults,
            context: contextData.context,
            confidence: agentState.confidence,
            iterations: agentState.iterations,
            agentLog: agentState.thinking
        };
    },

    // ============================================================
    // 🧠 AGENT: Query Analysis
    // ============================================================
    
    agentAnalyzeQuery(state) {
        this.log('\n🧠 Agent Thinking...');
        
        // Step 1: Extract keywords (buang stop words)
        const extraction = this.extractKeywords(state.currentQuery);
        
        // Step 2: Identify strategy
        const strategyName = state.strategies[state.currentStrategy % state.strategies.length];
        
        let keywords = extraction.keywords;
        let thought = '';
        
        switch(strategyName) {
            case 'keyword':
                thought = `Strategi KEYWORD: Mencari dengan kata kunci utama [${keywords.join(', ')}]`;
                break;
                
            case 'expanded':
                // Expand dengan synonyms
                keywords = this.expandWithSynonyms(keywords);
                thought = `Strategi EXPANDED: Memperluas pencarian dengan sinonim [${keywords.slice(0, 10).join(', ')}...]`;
                break;
                
            case 'fuzzy':
                // Coba partial matching
                thought = `Strategi FUZZY: Mencoba partial matching untuk hasil lebih luas`;
                break;
        }
        
        this.log(`💭 "${thought}"`);
        
        return {
            keywords: keywords,
            strategy: strategyName,
            thought: thought
        };
    },

    // ============================================================
    // 🔍 AGENT: Perform Search
    // ============================================================
    
    agentPerformSearch(keywords, knowledgeBase, state) {
        this.log('\n🔍 Searching...');
        
        const results = [];
        const strategyName = state.strategies[state.currentStrategy % state.strategies.length];
        
        Object.keys(knowledgeBase).forEach(key => {
            const doc = knowledgeBase[key];
            
            // Calculate scores based on strategy
            let scores;
            
            if (strategyName === 'fuzzy') {
                scores = {
                    keywordMatch: this.calculateFuzzyMatch(keywords, doc),
                    exactMatch: this.calculateExactMatch(keywords, doc),
                    entityMatch: this.calculateEntityMatch(keywords, doc),
                    contextMatch: this.calculateContextMatch(state.originalQuery, doc)
                };
            } else {
                scores = {
                    keywordMatch: this.calculateKeywordMatch(keywords, doc),
                    exactMatch: this.calculateExactMatch(keywords, doc),
                    entityMatch: this.calculateEntityMatch(keywords, doc),
                    contextMatch: this.calculateContextMatch(state.originalQuery, doc)
                };
            }
            
            // Weighted total
            const totalScore = (
                scores.keywordMatch * 5.0 +
                scores.exactMatch * 2.5 +
                scores.entityMatch * 2.0 +
                scores.contextMatch * 1.5
            );
            
            if (totalScore > 0) {
                results.push({
                    id: key,
                    title: doc.title,
                    content: doc.content,
                    tags: doc.tags || [],
                    score: totalScore,
                    scores: scores
                });
            }
        });
        
        // Sort by score
        results.sort((a, b) => b.score - a.score);
        
        // Return top K
        const topResults = results.slice(0, this.config.TOP_K);
        
        // Log results
        this.log(`📊 Found ${results.length} matching documents, returning top ${topResults.length}`);
        
        topResults.forEach((doc, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
            this.log(`\n${medal} #${idx + 1}: "${doc.title}"`);
            this.log(`   Score: ${doc.score.toFixed(2)}`);
            this.log(`   ├── 🔑 Keyword: ${(doc.scores.keywordMatch * 5.0).toFixed(2)}`);
            this.log(`   ├── 🎯 Exact: ${(doc.scores.exactMatch * 2.5).toFixed(2)}`);
            this.log(`   ├── 🏷️ Entity: ${(doc.scores.entityMatch * 2.0).toFixed(2)}`);
            this.log(`   └── 📝 Context: ${(doc.scores.contextMatch * 1.5).toFixed(2)}`);
        });
        
        return topResults;
    },

    // ============================================================
    // 📊 AGENT: Evaluate Results
    // ============================================================
    
    agentEvaluateResults(results, state) {
        this.log('\n📊 Evaluating Results...');
        
        if (results.length === 0) {
            this.log('❌ No results found!');
            return {
                isConfident: false,
                shouldRetry: true,
                confidence: 'none',
                assessment: 'Tidak ada hasil ditemukan. Perlu coba strategi lain.'
            };
        }
        
        const topScore = results[0].score;
        const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
        
        this.log(`   Top Score: ${topScore.toFixed(2)}`);
        this.log(`   Avg Score: ${avgScore.toFixed(2)}`);
        
        // Determine confidence
        let confidence = 'low';
        let isConfident = false;
        let shouldRetry = true;
        let assessment = '';
        
        if (topScore >= this.config.MIN_CONFIDENCE_SCORE) {
            confidence = 'high';
            isConfident = true;
            shouldRetry = false;
            assessment = `Score ${topScore.toFixed(2)} >= ${this.config.MIN_CONFIDENCE_SCORE}. Hasil sangat relevan!`;
            this.log(`✅ HIGH Confidence: ${assessment}`);
        } else if (topScore >= this.config.MIN_ACCEPTABLE_SCORE) {
            confidence = 'medium';
            isConfident = state.iterations >= 2; // Accept after 2 iterations
            shouldRetry = !isConfident;
            assessment = `Score ${topScore.toFixed(2)} >= ${this.config.MIN_ACCEPTABLE_SCORE}. Hasil cukup relevan.`;
            this.log(`💡 MEDIUM Confidence: ${assessment}`);
        } else {
            confidence = 'low';
            isConfident = false;
            shouldRetry = true;
            assessment = `Score ${topScore.toFixed(2)} < ${this.config.MIN_ACCEPTABLE_SCORE}. Hasil kurang relevan.`;
            this.log(`⚠️ LOW Confidence: ${assessment}`);
        }
        
        // Update best results if this is better
        const totalScore = this.getTotalScore(results);
        if (totalScore > state.bestScore) {
            state.bestScore = totalScore;
            state.bestResults = results;
            this.log(`📈 New best score: ${totalScore.toFixed(2)}`);
        }
        
        return {
            isConfident,
            shouldRetry,
            confidence,
            assessment,
            topScore,
            avgScore
        };
    },

    // ============================================================
    // 🔄 AGENT: Refine Query
    // ============================================================
    
    agentRefineQuery(state, evaluation) {
        this.log('\n🔄 Refining Query...');
        
        const originalKeywords = this.extractKeywords(state.originalQuery).keywords;
        
        // Strategy 1: Add synonyms
        if (state.currentStrategy === 1) {
            const expanded = this.expandWithSynonyms(originalKeywords);
            const newQuery = expanded.slice(0, 8).join(' ');
            this.log(`   Adding synonyms: "${newQuery}"`);
            return newQuery;
        }
        
        // Strategy 2: Use only important terms
        if (state.currentStrategy === 2) {
            const importantOnly = originalKeywords.filter(k => this.importantTerms.has(k));
            if (importantOnly.length > 0) {
                const newQuery = importantOnly.join(' ');
                this.log(`   Important terms only: "${newQuery}"`);
                return newQuery;
            }
        }
        
        // Fallback: return original
        return state.originalQuery;
    },

    // ============================================================
    // 🔑 KEYWORD EXTRACTION
    // ============================================================
    
    extractKeywords(query) {
        this.log('\n🔑 Extracting Keywords...');
        this.log(`   Input: "${query}"`);
        
        // Clean and normalize
        let cleaned = query.toLowerCase()
            .replace(/universitas gadjah mada/g, 'ugm')
            .replace(/gadjah mada/g, 'ugm')
            .replace(/[?!.,;:'"()\[\]{}]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        // Split into words
        const allWords = cleaned.split(' ').filter(w => w.length > 0);
        
        // Filter stop words
        const keywords = allWords.filter(word => {
            return !this.stopWords.has(word) && word.length > 1;
        });
        
        const removed = allWords.filter(word => this.stopWords.has(word));
        
        this.log(`   Removed: [${removed.join(', ')}]`);
        this.log(`   Keywords: [${keywords.join(', ')}]`);
        this.log(`   Result: "${keywords.join(' ').toUpperCase()}"`);
        
        return {
            keywords,
            original: query,
            removed
        };
    },

    // ============================================================
    // SCORING METHODS
    // ============================================================
    
    calculateKeywordMatch(keywords, doc) {
        const titleWords = this.tokenize(doc.title || '');
        const contentWords = this.tokenize(doc.content || '');
        const tagWords = (doc.tags || []).map(t => t.toLowerCase());
        
        let score = 0;
        
        keywords.forEach(keyword => {
            // Content match (highest)
            if (contentWords.includes(keyword)) score += 10;
            
            // Title match (high)
            if (titleWords.includes(keyword)) score += 8;
            
            // Tag match
            if (tagWords.some(tag => tag.includes(keyword))) score += 6;
        });
        
        return score;
    },
    
    calculateFuzzyMatch(keywords, doc) {
        const content = (doc.content || '').toLowerCase();
        const title = (doc.title || '').toLowerCase();
        
        let score = 0;
        
        keywords.forEach(keyword => {
            // Partial match in content
            if (content.includes(keyword)) score += 8;
            
            // Partial match in title
            if (title.includes(keyword)) score += 6;
            
            // Check if any word starts with keyword
            const contentWords = content.split(/\s+/);
            contentWords.forEach(word => {
                if (word.startsWith(keyword) || keyword.startsWith(word)) {
                    score += 3;
                }
            });
        });
        
        return score;
    },
    
    calculateExactMatch(queryWords, doc) {
        const titleWords = this.tokenize(doc.title || '');
        const contentWords = this.tokenize(doc.content || '');
        const tagWords = (doc.tags || []).map(t => t.toLowerCase());
        
        let score = 0;
        
        queryWords.forEach(queryWord => {
            if (contentWords.includes(queryWord)) score += 8;
            if (tagWords.some(tag => tag.includes(queryWord))) score += 5;
            if (titleWords.includes(queryWord)) score += 4;
        });
        
        return score;
    },
    
    calculateEntityMatch(queryWords, doc) {
        const titleWords = this.tokenize(doc.title || '');
        const contentWords = this.tokenize(doc.content || '');
        const tagWords = (doc.tags || []).map(t => t.toLowerCase());
        
        let score = 0;
        
        queryWords.forEach(word => {
            if (this.importantTerms.has(word)) {
                if (titleWords.includes(word)) score += 15;
                if (tagWords.includes(word)) score += 12;
                if (contentWords.includes(word)) score += 5;
            }
        });
        
        return score;
    },
    
    calculateContextMatch(query, doc) {
        const queryLower = query.toLowerCase();
        const titleLower = (doc.title || '').toLowerCase();
        const contentLower = (doc.content || '').toLowerCase();
        
        let score = 0;
        
        // Check for phrases
        const phrases = this.extractPhrases(queryLower);
        phrases.forEach(phrase => {
            if (titleLower.includes(phrase)) score += 8;
            if (contentLower.includes(phrase)) score += 3;
        });
        
        return score;
    },

    // ============================================================
    // HELPER METHODS
    // ============================================================
    
    tokenize(text) {
        return text
            .toLowerCase()
            .replace(/universitas gadjah mada/g, 'ugm')
            .replace(/gadjah mada/g, 'ugm')
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 1);
    },
    
    expandWithSynonyms(words) {
        const expanded = new Set(words);
        
        words.forEach(word => {
            if (this.synonyms[word]) {
                this.synonyms[word].forEach(syn => expanded.add(syn));
            }
            
            Object.keys(this.synonyms).forEach(key => {
                if (this.synonyms[key].includes(word)) {
                    expanded.add(key);
                    this.synonyms[key].forEach(syn => expanded.add(syn));
                }
            });
        });
        
        return Array.from(expanded);
    },
    
    extractPhrases(text) {
        const words = text.split(/\s+/).filter(w => w.length > 2);
        const phrases = [];
        
        for (let i = 0; i < words.length - 1; i++) {
            phrases.push(words[i] + ' ' + words[i + 1]);
        }
        
        for (let i = 0; i < words.length - 2; i++) {
            phrases.push(words[i] + ' ' + words[i + 1] + ' ' + words[i + 2]);
        }
        
        return phrases;
    },
    
    getTotalScore(results) {
        return results.reduce((sum, r) => sum + r.score, 0);
    },
    
    log(message) {
        if (this.config.DEBUG) {
            console.log(message);
        }
    },

    // ============================================================
    // BUILD CONTEXT
    // ============================================================
    
    buildContext(documents) {
        if (!documents || documents.length === 0) {
            return { context: '', confidence: 'none', hasRelevantInfo: false };
        }

        const maxScore = Math.max(...documents.map(d => d.score));
        let confidence = 'medium';
        
        if (maxScore >= this.config.MIN_CONFIDENCE_SCORE) {
            confidence = 'high';
        } else if (maxScore >= this.config.MIN_ACCEPTABLE_SCORE) {
            confidence = 'medium';
        } else {
            confidence = 'low';
        }

        const contextParts = [];

        if (confidence === 'high') {
            contextParts.push('✅ INFORMASI DITEMUKAN - Gunakan informasi ini untuk menjawab!');
        } else if (confidence === 'medium') {
            contextParts.push('💡 INFORMASI TERKAIT - Informasi relevan ditemukan.');
        } else {
            contextParts.push('🔍 INFORMASI UMUM - Gunakan sebagai referensi.');
        }

        documents.forEach((doc, idx) => {
            const tags = doc.tags && doc.tags.length > 0 
                ? `\n🏷️ Tags: ${doc.tags.join(', ')}` 
                : '';
            contextParts.push(`\n[Dokumen ${idx + 1}: ${doc.title}] (Score: ${doc.score.toFixed(1)})${tags}\n${doc.content}`);
        });

        return {
            context: contextParts.join('\n\n---\n'),
            confidence: confidence,
            hasRelevantInfo: documents.length > 0
        };
    },

    // ============================================================
    // PUBLIC API - Backward Compatible
    // ============================================================
    
    /**
     * Main search method - now uses Agentic approach
     */
    async search(query, topK = 3, conversationContext = '') {
        // Update config
        this.config.TOP_K = topK;
        
        // Use agentic search
        const result = await this.agentSearch(query, conversationContext);
        
        return result.results;
    },
    
    /**
     * Get knowledge count
     */
    async getCount() {
        try {
            const snapshot = await database.ref('knowledge').once('value');
            const data = snapshot.val();
            return data ? Object.keys(data).length : 0;
        } catch {
            return 0;
        }
    }
};