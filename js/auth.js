/**
 * Auth Service untuk Settings Protection
 */

const Auth = {
    ADMIN_PASSWORD: 'ugm2025', // ⚠️ GANTI INI!
    SESSION_KEY: 'ugm_admin_session',
    SESSION_DURATION: 3600000, // 1 jam

    /**
     * Verify password dan buat session token
     */
    async login(password) {
        if (password !== this.ADMIN_PASSWORD) {
            throw new Error('Password salah!');
        }

        // Generate session token
        const token = this.generateToken();
        const session = {
            token: token,
            created: Date.now(),
            expires: Date.now() + this.SESSION_DURATION
        };

        // Save to localStorage
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));

        // Save token to Firebase (untuk validasi server-side)
        try {
            await database.ref(`sessionTokens/${token}`).set({
                created: session.created,
                expires: session.expires
            });
        } catch (error) {
            console.error('Failed to save token to Firebase:', error);
        }

        return token;
    },

    /**
     * Check if user has valid session
     */
    isAuthenticated() {
        const sessionStr = localStorage.getItem(this.SESSION_KEY);
        if (!sessionStr) return false;

        try {
            const session = JSON.parse(sessionStr);
            
            // Check expiration
            if (Date.now() > session.expires) {
                this.logout();
                return false;
            }

            return true;
        } catch (error) {
            return false;
        }
    },

    /**
     * Get current session token
     */
    getToken() {
        const sessionStr = localStorage.getItem(this.SESSION_KEY);
        if (!sessionStr) return null;

        try {
            const session = JSON.parse(sessionStr);
            return session.token;
        } catch (error) {
            return null;
        }
    },

    /**
     * Logout - clear session
     */
    async logout() {
        const token = this.getToken();
        
        // Remove from localStorage
        localStorage.removeItem(this.SESSION_KEY);

        // Remove from Firebase
        if (token) {
            try {
                await database.ref(`sessionTokens/${token}`).remove();
            } catch (error) {
                console.error('Failed to remove token from Firebase:', error);
            }
        }
    },

    /**
     * Generate random token
     */
    generateToken() {
        return 'admin_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
    },

    /**
     * Extend session (called on activity)
     */
    extendSession() {
        if (!this.isAuthenticated()) return false;

        const sessionStr = localStorage.getItem(this.SESSION_KEY);
        const session = JSON.parse(sessionStr);
        session.expires = Date.now() + this.SESSION_DURATION;
        
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
        
        // Update Firebase
        database.ref(`sessionTokens/${session.token}/expires`).set(session.expires);
        
        return true;
    }
};
