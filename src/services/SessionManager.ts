import { SessionLogService } from "./SessionLogService";

export interface SavedSession {
    id: string;
    name: string;
    timestamp: number;
    preview: string;
    isActive?: boolean;
}

const STORAGE_KEY = 'termai_saved_sessions';
const ACTIVE_SESSIONS_KEY = 'termai_active_sessions';

export class SessionManager {
    // Track active sessions that have been started on backend
    private static activeSessions: Set<string> = new Set();

    static {
        // Load active sessions from storage on init
        // Guard for browser environment
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
            try {
                const stored = localStorage.getItem(ACTIVE_SESSIONS_KEY);
                if (stored) {
                    const ids = JSON.parse(stored) as string[];
                    ids.forEach(id => this.activeSessions.add(id));
                }
            } catch (e) {
                console.error('Failed to load active sessions', e);
            }
        }
    }

    private static saveActiveSessions(): void {
        try {
            localStorage.setItem(
                ACTIVE_SESSIONS_KEY,
                JSON.stringify(Array.from(this.activeSessions))
            );
        } catch (e) {
            console.warn('[SessionManager] Failed to save active sessions (quota exceeded?):', e);
        }
    }

    static getSessions(): SavedSession[] {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            const sessions = stored ? JSON.parse(stored) : [];
            // Mark active sessions
            return sessions.map((s: SavedSession) => ({
                ...s,
                isActive: this.activeSessions.has(s.id)
            }));
        } catch (e) {
            console.error('Failed to load sessions', e);
            return [];
        }
    }

    /**
     * Start a new session - creates both frontend and backend session
     * Idempotent: if session is already active, returns existing session without API call
     */
    static async startSession(sessionId: string, name?: string): Promise<SavedSession> {
        // Idempotency check: if session is already active, just return existing session
        if (this.activeSessions.has(sessionId)) {
            const existing = this.getSession(sessionId);
            if (existing) {
                console.log(`[SessionManager] Session ${sessionId} already active, skipping start`);
                return existing;
            }
        }

        // Start backend session log
        await SessionLogService.startSession(sessionId);
        this.activeSessions.add(sessionId);
        this.saveActiveSessions();

        const session: SavedSession = {
            id: sessionId,
            name: name || `Session ${sessionId.substring(0, 6)}`,
            timestamp: Date.now(),
            preview: '',
            isActive: true
        };

        this.saveSession(session);
        console.log(`[SessionManager] Started session: ${sessionId}`);
        return session;
    }

    /**
     * End a session - closes backend session log
     */
    static async endSession(sessionId: string): Promise<void> {
        await SessionLogService.endSession(sessionId);
        this.activeSessions.delete(sessionId);
        this.saveActiveSessions();

        // Update session in storage
        const sessions = this.getSessions();
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            session.isActive = false;
            this.saveSession(session);
        }

        console.log(`[SessionManager] Ended session: ${sessionId}`);
    }

    static saveSession(session: SavedSession): void {
        const sessions = this.getSessions();
        const index = sessions.findIndex(s => s.id === session.id);

        if (index >= 0) {
            sessions[index] = { ...sessions[index], ...session };
        } else {
            sessions.push(session);
        }

        // Sort by timestamp desc
        sessions.sort((a, b) => b.timestamp - a.timestamp);

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
        } catch (e) {
            console.warn('[SessionManager] Failed to save session (quota exceeded?):', e);
            // Try to clear old sessions to make room
            this.pruneOldSessions();
        }
        window.dispatchEvent(new CustomEvent('termai-sessions-updated'));
    }

    /**
     * Remove old sessions to free up localStorage space
     */
    private static pruneOldSessions(): void {
        try {
            const sessions = this.getSessions();
            // Keep only the 10 most recent sessions
            const pruned = sessions.slice(0, 10);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
            console.log(`[SessionManager] Pruned sessions from ${sessions.length} to ${pruned.length}`);
        } catch (e) {
            // If still failing, clear all sessions
            console.warn('[SessionManager] Clearing all sessions due to quota issues');
            try {
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(ACTIVE_SESSIONS_KEY);
            } catch {
                // localStorage completely broken, continue without persistence
            }
        }
    }

    static async deleteSession(id: string): Promise<void> {
        // End backend session if active
        if (this.activeSessions.has(id)) {
            await SessionLogService.endSession(id);
            this.activeSessions.delete(id);
            this.saveActiveSessions();
        }

        // Delete the backend session log file
        await SessionLogService.deleteSessionLog(id);

        // Remove from localStorage
        const sessions = this.getSessions().filter(s => s.id !== id);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
        } catch (e) {
            console.warn('[SessionManager] Failed to save after delete (quota exceeded?):', e);
        }
        window.dispatchEvent(new CustomEvent('termai-sessions-updated'));
    }

    static renameSession(id: string, newName: string): void {
        const sessions = this.getSessions();
        const session = sessions.find(s => s.id === id);
        if (session) {
            session.name = newName;
            this.saveSession(session);
        }
    }

    static getSession(id: string): SavedSession | undefined {
        return this.getSessions().find(s => s.id === id);
    }

    static isSessionActive(id: string): boolean {
        return this.activeSessions.has(id);
    }

    /**
     * Generate a new unique session ID
     */
    static generateSessionId(): string {
        return `ses_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
    }
}
