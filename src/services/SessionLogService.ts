/**
 * SessionLogService
 * Interface for backend session logging APIs
 */

import { config } from "../config";

export interface SessionLogMetadata {
  sessionId: string;
  filename: string;
  size: number;
  created: string;
  modified: string;
}

export interface SessionLogContent {
  sessionId: string;
  content: string;
}

export class SessionLogService {
  /**
   * Start a new session log on the backend
   */
  static async startSession(sessionId: string): Promise<boolean> {
    try {
      const response = await fetch(`${config.apiUrl}/api/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        console.error("Failed to start session log:", await response.text());
        return false;
      }

      const data = await response.json();
      console.log(`[SessionLog] Started session: ${sessionId}`, data);
      return true;
    } catch (error) {
      console.error("Error starting session log:", error);
      return false;
    }
  }

  /**
   * End a session log on the backend
   */
  static async endSession(sessionId: string): Promise<boolean> {
    try {
      const response = await fetch(`${config.apiUrl}/api/session/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        console.error("Failed to end session log:", await response.text());
        return false;
      }

      console.log(`[SessionLog] Ended session: ${sessionId}`);
      return true;
    } catch (error) {
      console.error("Error ending session log:", error);
      return false;
    }
  }

  /**
   * Get list of all session logs
   */
  static async getSessionLogs(): Promise<SessionLogMetadata[]> {
    try {
      const response = await fetch(`${config.apiUrl}/api/session/logs`);

      if (!response.ok) {
        console.error("Failed to get session logs:", await response.text());
        return [];
      }

      const data = await response.json();
      return data.logs || [];
    } catch (error) {
      console.error("Error getting session logs:", error);
      return [];
    }
  }

  /**
   * Get content of a specific session log
   */
  static async getSessionLog(sessionId: string): Promise<string | null> {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/session/logs/${encodeURIComponent(sessionId)}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        console.error("Failed to get session log:", await response.text());
        return null;
      }

      const data = await response.json();
      return data.content || null;
    } catch (error) {
      console.error("Error getting session log:", error);
      return null;
    }
  }

  /**
   * Get the main application log (termai.log)
   */
  static async getMainLog(lines: number = 100): Promise<string | null> {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/session/logs/main?lines=${lines}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.content || null;
    } catch (error) {
      console.error("Error getting main log:", error);
      return null;
    }
  }

  /**
   * Delete a session log from the backend
   */
  static async deleteSessionLog(sessionId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/session/logs/${encodeURIComponent(sessionId)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        console.error("Failed to delete session log:", await response.text());
        return false;
      }

      console.log(`[SessionLog] Deleted session log: ${sessionId}`);
      return true;
    } catch (error) {
      console.error("Error deleting session log:", error);
      return false;
    }
  }
}
