export interface SavedSession {
    id: string;
    name: string;
    timestamp: number;
    preview: string;
}

const STORAGE_KEY = 'termai_saved_sessions';

export class SessionManager {
    static getSessions(): SavedSession[] {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Failed to load sessions', e);
            return [];
        }
    }

    static saveSession(session: SavedSession): void {
        const sessions = this.getSessions();
        const index = sessions.findIndex(s => s.id === session.id);

        if (index >= 0) {
            sessions[index] = session;
        } else {
            sessions.push(session);
        }

        // Sort by timestamp desc
        sessions.sort((a, b) => b.timestamp - a.timestamp);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
        window.dispatchEvent(new CustomEvent('termai-sessions-updated'));
    }

    static deleteSession(id: string): void {
        const sessions = this.getSessions().filter(s => s.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
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
}
