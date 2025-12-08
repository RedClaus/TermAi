/**
 * Session Persistence Service
 * Saves and restores full session state including chat history, settings, and context
 */

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'system' | 'command';
  content: string;
  timestamp: number;
  command?: string;
  status?: 'success' | 'error' | 'running' | 'cancelled';
  output?: string;
  exitCode?: number;
}

export interface SessionState {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  history: ChatMessage[];
  modelId?: string;
  provider?: string;
  autoRunEnabled?: boolean;
  metadata?: {
    messageCount: number;
    commandCount: number;
    lastUserMessage?: string;
  };
}

const SESSION_STATE_PREFIX = 'termai_session_state_';
const SESSION_INDEX_KEY = 'termai_session_index';

class SessionPersistenceServiceClass {
  /**
   * Save full session state
   */
  saveSession(state: SessionState): void {
    try {
      // Update metadata
      state.updatedAt = Date.now();
      const lastUserMsg = state.history.filter(h => h.type === 'user').pop()?.content?.substring(0, 100);
      state.metadata = {
        messageCount: state.history.length,
        commandCount: state.history.filter(h => h.type === 'command').length,
        ...(lastUserMsg ? { lastUserMessage: lastUserMsg } : {}),
      };

      // Save session state
      localStorage.setItem(
        `${SESSION_STATE_PREFIX}${state.id}`,
        JSON.stringify(state)
      );

      // Update session index
      this.updateSessionIndex(state);

      console.log(`[SessionPersistence] Saved session: ${state.id} (${state.history.length} messages)`);
    } catch (error) {
      console.error('[SessionPersistence] Failed to save session:', error);
    }
  }

  /**
   * Load session state by ID
   */
  loadSession(sessionId: string): SessionState | null {
    try {
      const data = localStorage.getItem(`${SESSION_STATE_PREFIX}${sessionId}`);
      if (!data) return null;

      const state = JSON.parse(data) as SessionState;
      console.log(`[SessionPersistence] Loaded session: ${sessionId} (${state.history.length} messages)`);
      return state;
    } catch (error) {
      console.error('[SessionPersistence] Failed to load session:', error);
      return null;
    }
  }

  /**
   * Delete session state
   */
  deleteSession(sessionId: string): void {
    try {
      localStorage.removeItem(`${SESSION_STATE_PREFIX}${sessionId}`);
      this.removeFromSessionIndex(sessionId);
      console.log(`[SessionPersistence] Deleted session: ${sessionId}`);
    } catch (error) {
      console.error('[SessionPersistence] Failed to delete session:', error);
    }
  }

  /**
   * Get all saved sessions (metadata only, not full history)
   */
  getSavedSessions(): Array<{
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    cwd: string;
    metadata?: SessionState['metadata'];
  }> {
    try {
      const indexData = localStorage.getItem(SESSION_INDEX_KEY);
      if (!indexData) return [];

      const index = JSON.parse(indexData) as string[];
      const sessions: Array<{
        id: string;
        name: string;
        createdAt: number;
        updatedAt: number;
        cwd: string;
        metadata?: SessionState['metadata'];
      }> = [];

      for (const sessionId of index) {
        const data = localStorage.getItem(`${SESSION_STATE_PREFIX}${sessionId}`);
        if (data) {
          const state = JSON.parse(data) as SessionState;
          sessions.push({
            id: state.id,
            name: state.name,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt,
            cwd: state.cwd,
            metadata: state.metadata,
          });
        }
      }

      // Sort by updatedAt descending
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      return sessions;
    } catch (error) {
      console.error('[SessionPersistence] Failed to get saved sessions:', error);
      return [];
    }
  }

  /**
   * Check if a session has saved state
   */
  hasSession(sessionId: string): boolean {
    return localStorage.getItem(`${SESSION_STATE_PREFIX}${sessionId}`) !== null;
  }

  /**
   * Export session as JSON (for backup/sharing)
   */
  exportSession(sessionId: string): string | null {
    const state = this.loadSession(sessionId);
    if (!state) return null;
    return JSON.stringify(state, null, 2);
  }

  /**
   * Import session from JSON
   */
  importSession(jsonData: string): SessionState | null {
    try {
      const state = JSON.parse(jsonData) as SessionState;
      
      // Validate required fields
      if (!state.id || !state.name || !state.history) {
        throw new Error('Invalid session data');
      }

      // Generate new ID to avoid conflicts
      const newId = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      state.id = newId;
      state.name = `${state.name} (imported)`;
      state.createdAt = Date.now();
      state.updatedAt = Date.now();

      this.saveSession(state);
      return state;
    } catch (error) {
      console.error('[SessionPersistence] Failed to import session:', error);
      return null;
    }
  }

  /**
   * Get storage usage info
   */
  getStorageInfo(): { sessionCount: number; estimatedSize: string } {
    const sessions = this.getSavedSessions();
    let totalSize = 0;

    for (const session of sessions) {
      const data = localStorage.getItem(`${SESSION_STATE_PREFIX}${session.id}`);
      if (data) {
        totalSize += data.length * 2; // UTF-16 encoding
      }
    }

    return {
      sessionCount: sessions.length,
      estimatedSize: this.formatBytes(totalSize),
    };
  }

  /**
   * Clear old sessions to free up storage
   */
  clearOldSessions(keepCount: number = 10): number {
    const sessions = this.getSavedSessions();
    let deletedCount = 0;

    if (sessions.length > keepCount) {
      const toDelete = sessions.slice(keepCount);
      for (const session of toDelete) {
        this.deleteSession(session.id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  // Private helpers

  private updateSessionIndex(state: SessionState): void {
    const indexData = localStorage.getItem(SESSION_INDEX_KEY);
    const index: string[] = indexData ? JSON.parse(indexData) : [];

    if (!index.includes(state.id)) {
      index.push(state.id);
      localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(index));
    }
  }

  private removeFromSessionIndex(sessionId: string): void {
    const indexData = localStorage.getItem(SESSION_INDEX_KEY);
    if (!indexData) return;

    const index: string[] = JSON.parse(indexData);
    const newIndex = index.filter(id => id !== sessionId);
    localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(newIndex));
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const SessionPersistenceService = new SessionPersistenceServiceClass();
